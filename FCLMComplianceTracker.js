// ==UserScript==
// @name         FCLMComplianceTracker
// @version      0.9g.20240826.0227
// @updateURL https://raw.githubusercontent.com/elshafeo/FCLMComplianceTracker/main/FCLMComplianceTracker.js
// @downloadURL https://raw.githubusercontent.com/elshafeo/FCLMComplianceTracker/main/FCLMComplianceTracker.js
// @description  Adds colors to ppaTimeOnTask to show Job Rotation Compliance, checks for 5S/Non Productive, and displays the Direct Function, Previous Task, and Current Task.
// @author       @elshafeo & @harefmak DBV1
// @station      DBV1
// @include      https://fclm-portal.amazon.com/reports/ppaTimeOnTask*
// @icon         https://i.pinimg.com/originals/29/f6/41/29f641b507ccb60bb7a62a830b988736.jpg
// @grant        GM_xmlhttpRequest
// ==/UserScript==
/*
   FCLM Compliance Tracker - Documentation

   Introduction:
   The FCLM Compliance Tracker is designed to monitor job rotation compliance by tracking and color-coding tasks based on their duration and frequency.
   It helps managers easily identify potential job rotation violations and ensure that SAs are not overburdened with the same task.

   Installation Instructions:
   1. Install a userscript manager like Tampermonkey.
   2. Copy and paste this script into a new userscript in your manager.
   3. Save and enable the script.

   Features Overview:
   - **Color Coding:**
     - Red: Indicates that the current task and the previous day's task are the same, and both exceed 210 minutes.
     - Yellow: Flags when the current task is the same as the previous day's task (or in the same group) but does not meet the red criteria.
     - Cyan: Highlights 5S/Non-Productive tasks.
     - Green: Shows compliance with job rotation, including tasks overridden as non-rotational (e.g., support roles).
   - **Prev Task and Current Task Columns:**
     - These columns display the tasks performed by the SA on the previous day and the current day, respectively. This allows for easy comparison without manually checking each entry.
   - **Same Task Group Handling:**
     - Similar tasks (e.g., Induct Line Loader and Pusher) are treated as the same for rotation compliance purposes and flagged accordingly.
   - **Multiple Tasks in Prev Task:**
     - If an SA performed more than one task exceeding 210 minutes on the previous day, both tasks are displayed with red font, indicating potential rotation issues.

   Customization Options:
   - Modify the task groups, excluded tasks, or color scheme by adjusting the relevant arrays and values in the script.

   Known Limitations:
   - Performance may degrade with an extremely high number of rows.
   - The script may not handle more than two tasks exceeding 210 minutes as effectively.

   Troubleshooting:
   - If the script freezes or doesn't apply colors correctly, try refreshing the page or reducing the number of rows processed.

   Version History:
      - **0.9g.20240826.0227:**
     - Added automatic update functionality via GitHub hosting.
     - Removed task grouping logic to resolve color conflict issues.
     - Added background task running capabilities (beta).
   - **0.9f.20240814.1750:**
     - Adjusted logic for group handling.
     - Improved multi-task detection.
     - Optimized performance.
   - **0.9e.20240813.1620:**
     - Implemented task group handling.
     - Introduced multi-task detection.
     - Optimized performance.
   - **0.9d.20240812.0740:**
     - Added font color change for multiple tasks in "Prev Task" cell.
     - Adjusted logic for same task group handling.
     - Included "None" in the "Prev Task" cell when no tasks exceeded 210 minutes.
   - **0.9c.20240812.1120:**
     - Introduced yellow and cyan color coding.
     - Enhanced task comparison logic to handle edge cases.
     - Added support for specific tasks to override default color-coding logic.
   - **0.9b.20240811.0120:**
     - Introduced "Current Task" and "Prev Task" columns.
     - Improved job rotation compliance checks with color coding.
   - **0.9a.20240811.1220:**
     - Restructured color-coding logic for job rotation compliance.
     - Implemented basic HTTP request handling for task data retrieval.
   - **0.3:**
     - Added initial color-coding logic for job rotation.

   Credits:
   - Developed by @elshafeo & @harefmak for DBV1 operations.
   - Origin version 0.3 basic Implementation of color coding by @nmeijona

   Contact Information:
   - For support, suggestions, or bug reports, please reach out to @elshafeo.
*/

let today;
let previousDay;
let nextDay;

const jobRotationTasks = [
    "Pick to Buffer",
    "Container Building",
    "Induct",
    "Induct Line Loader",
    "Pusher",
    "Inbound Dock W/S",
    "Sort Problem Solve",
    "Diverter",
    "Auto Divert Straightener",
    "Auto Scan Induct Loader",
    "Auto Scan Pusher",
    "ADTA Container Building"
];

const tasksExcludedFromRed = ["Yard Marshal", "Sort Problem Solve"];
const greenOverrideTasks = ["Non-Core Support", "UTR OPS Supervisor / SA", "OTR Supervisor / Shift Assistant", "OTR Support", "UTR", "CS DSL", "HR"];
const taskGroups = {
    "Induct Line Loader": "Group1",
    "Pusher": "Group1",
    "Inbound Dock W/S": "Group1",
    // Remove Group2 as requested
};

(function() {
    'use strict';

    const startDateDayElement = document.getElementById("startDateDay");
    if (!startDateDayElement) {
        console.error('startDateDay element not found');
        return;
    }
    const date = new Date(startDateDayElement.value);
    date.setHours(2);
    today = date.toJSON().split("T", 1)[0];
    date.setDate(date.getDate() - 1);
    previousDay = date.toJSON().split("T", 1)[0];
    date.setDate(date.getDate() + 2);
    nextDay = date.toJSON().split("T", 1)[0];

    const rows = Array.from(document.getElementsByTagName('tbody')[1].children).map(row => ({ key: row.children[0].innerText, value: row }));

    const headerRow = document.getElementsByTagName('thead')[0].children[0];
    const prevTaskHeaderCell = document.createElement('th');
    prevTaskHeaderCell.innerText = "Prev Task (210+ mins)";
    headerRow.appendChild(prevTaskHeaderCell);

    const currentTaskHeaderCell = document.createElement('th');
    currentTaskHeaderCell.innerText = "Current Task";
    headerRow.appendChild(currentTaskHeaderCell);

    fetchPreviousDayTask(rows, 0);
})();

function fetchPreviousDayTask(rows, index) {
    if (index >= rows.length) return;

    GM_xmlhttpRequest({
        method: "GET",
        url: `https://fclm-portal.amazon.com/employee/ppaTimeDetails?employeeId=${rows[index].key}&startTime=${previousDay}T00%3a00%3a00%2b0200&endTime=${today}T00%3a00%3a00%2b0200`,
        responseType: "document",
        headers: {
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
            "Content-Type": "text/html;charset=UTF-8"
        },
        onload(response) {
            const doc = new DOMParser().parseFromString(response.responseText, "text/html");

            let previousDayTasks = [];
            let taskSegments = [];
            let previousTasksOver210 = [];

            try {
                taskSegments = Array.from(doc.getElementsByClassName("function-seg")).slice(4);
            } catch (error) {
                console.error('Error parsing task segments:', error);
            }

            taskSegments.forEach(segment => {
                const taskName = segment.children[0].innerText.split("\t", 4)[3].split("♦", 1)[0];
                const taskDuration = segment.children[3].innerText;
                let taskAdded = false;
                for (let j = 0; j < previousDayTasks.length; j++) {
                    if (taskName === previousDayTasks[j].taskName) {
                        const mins = parseInt(previousDayTasks[j].taskDuration.split(":", 1)[0]) + parseInt(taskDuration.split(":", 1)[0]) + Math.floor((parseInt(previousDayTasks[j].taskDuration.split(":", 2)[1]) + parseInt(taskDuration.split(":", 2)[1])) / 60);
                        const secs = (parseInt(previousDayTasks[j].taskDuration.split(":", 2)[1]) + parseInt(taskDuration.split(":", 2)[1])) % 60;
                        previousDayTasks[j].taskDuration = `${mins}:${secs}`;
                        taskAdded = true;
                        break;
                    }
                }
                if (!taskAdded) {
                    previousDayTasks.push({ taskName, taskDuration });
                }
            });

            previousDayTasks.forEach(task => {
                if (parseInt(task.taskDuration.split(":", 1)[0]) >= 210) {
                    previousTasksOver210.push(task.taskName);
                }
            });

            let prevTaskCell = document.createElement('td');
            if (previousTasksOver210.length > 0) {
                prevTaskCell.innerText = previousTasksOver210.join(", ");
                prevTaskCell.style.color = previousTasksOver210.length > 1 ? "red" : ""; // Set font color to red if there are multiple tasks
            } else {
                prevTaskCell.innerText = "None";
            }
            rows[index].value.appendChild(prevTaskCell);

            fetchCurrentDayTask(rows, index, previousTasksOver210);
        },
        onerror(e) {
            console.error(e);
        }
    });
}

function fetchPreviousDayTask(rows, index) {
    if (index >= rows.length) return;

    GM_xmlhttpRequest({
        method: "GET",
        url: `https://fclm-portal.amazon.com/employee/ppaTimeDetails?employeeId=${rows[index].key}&startTime=${previousDay}T00%3a00%3a00%2b0200&endTime=${today}T00%3a00%3a00%2b0200`,
        responseType: "document",
        headers: {
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
            "Content-Type": "text/html;charset=UTF-8"
        },
        onload(response) {
            const doc = new DOMParser().parseFromString(response.responseText, "text/html");

            let previousDayTaskDurations = {};
            let taskSegments = [];

            try {
                taskSegments = Array.from(doc.getElementsByClassName("function-seg")).slice(4);
            } catch (error) {
                console.error('Error parsing task segments:', error);
            }

            taskSegments.forEach(segment => {
                const taskName = segment.children[0].innerText.split("\t", 4)[3].split("♦", 1)[0];
                const duration = segment.children[3].innerText;
                const mins = parseInt(duration.split(":", 1)[0]);

                if (!previousDayTaskDurations[taskName]) {
                    previousDayTaskDurations[taskName] = mins;
                } else {
                    previousDayTaskDurations[taskName] += mins;
                }
            });

            let prevTaskCell = document.createElement('td');
            let tasksOver210 = Object.keys(previousDayTaskDurations).filter(task => previousDayTaskDurations[task] >= 210);
            prevTaskCell.innerText = tasksOver210.join(", ");
            prevTaskCell.style.color = tasksOver210.length > 1 ? "red" : ""; // Set font color to red if there are multiple tasks
            rows[index].value.appendChild(prevTaskCell);

            fetchCurrentDayTask(rows, index, previousDayTaskDurations);
        },
        onerror(e) {
            console.error(e);
        }
    });
}

function fetchPreviousDayTask(rows, index) {
    if (index >= rows.length) return;

    GM_xmlhttpRequest({
        method: "GET",
        url: `https://fclm-portal.amazon.com/employee/ppaTimeDetails?employeeId=${rows[index].key}&startTime=${previousDay}T00%3a00%3a00%2b0200&endTime=${today}T00%3a00%3a00%2b0200`,
        responseType: "document",
        headers: {
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
            "Content-Type": "text/html;charset=UTF-8"
        },
        onload(response) {
            const doc = new DOMParser().parseFromString(response.responseText, "text/html");

            let previousDayTaskDurations = {};
            let taskSegments = [];

            try {
                taskSegments = Array.from(doc.getElementsByClassName("function-seg")).slice(4);
            } catch (error) {
                console.error('Error parsing task segments:', error);
            }

            taskSegments.forEach(segment => {
                const taskElement = segment.children[0];
                const durationElement = segment.children[3];

                if (taskElement && durationElement) {
                    const taskNameParts = taskElement.innerText.split("\t", 4);
                    const taskName = taskNameParts.length > 3 ? taskNameParts[3].split("♦", 1)[0] : "Unknown Task";
                    const duration = durationElement.innerText;
                    const mins = parseInt(duration.split(":", 1)[0]);

                    if (!previousDayTaskDurations[taskName]) {
                        previousDayTaskDurations[taskName] = mins;
                    } else {
                        previousDayTaskDurations[taskName] += mins;
                    }
                }
            });

            let prevTaskCell = document.createElement('td');
            let tasksOver210 = Object.keys(previousDayTaskDurations).filter(task => previousDayTaskDurations[task] >= 210);
            prevTaskCell.innerText = tasksOver210.join(", ");
            prevTaskCell.style.color = tasksOver210.length > 1 ? "red" : ""; // Set font color to red if there are multiple tasks
            rows[index].value.appendChild(prevTaskCell);

            fetchCurrentDayTask(rows, index, previousDayTaskDurations);
        },
        onerror(e) {
            console.error(e);
        }
    });
}

function fetchPreviousDayTask(rows, index) {
    if (index >= rows.length) return;

    GM_xmlhttpRequest({
        method: "GET",
        url: `https://fclm-portal.amazon.com/employee/ppaTimeDetails?employeeId=${rows[index].key}&startTime=${previousDay}T00%3a00%3a00%2b0200&endTime=${today}T00%3a00%3a00%2b0200`,
        responseType: "document",
        headers: {
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
            "Content-Type": "text/html;charset=UTF-8"
        },
        onload(response) {
            const doc = new DOMParser().parseFromString(response.responseText, "text/html");

            let previousDayTaskDurations = {};
            let taskSegments = [];

            try {
                taskSegments = Array.from(doc.getElementsByClassName("function-seg")).slice(4);
            } catch (error) {
                console.error('Error parsing task segments:', error);
            }

            taskSegments.forEach(segment => {
                const taskElement = segment.children[0];
                const durationElement = segment.children[3];

                if (taskElement && durationElement) {
                    const taskNameParts = taskElement.innerText.split("\t", 4);
                    const taskName = taskNameParts.length > 3 ? taskNameParts[3].split("♦", 1)[0] : "Unknown Task";
                    const duration = durationElement.innerText;
                    const mins = parseInt(duration.split(":", 1)[0]);

                    if (!previousDayTaskDurations[taskName]) {
                        previousDayTaskDurations[taskName] = mins;
                    } else {
                        previousDayTaskDurations[taskName] += mins;
                    }
                }
            });

            let prevTaskCell = document.createElement('td');
            let tasksOver210 = Object.keys(previousDayTaskDurations).filter(task => previousDayTaskDurations[task] >= 210);
            prevTaskCell.innerText = tasksOver210.join(", ");
            prevTaskCell.style.color = tasksOver210.length > 1 ? "red" : ""; // Set font color to red if there are multiple tasks
            rows[index].value.appendChild(prevTaskCell);

            fetchCurrentDayTask(rows, index, previousDayTaskDurations);
        },
        onerror(e) {
            console.error(e);
        }
    });
}

function fetchCurrentDayTask(rows, index, previousDayTaskDurations) {
    if (index >= rows.length) return;

    GM_xmlhttpRequest({
        method: "GET",
        url: `https://fclm-portal.amazon.com/employee/ppaTimeDetails?employeeId=${rows[index].key}&startTime=${today}T00%3a00%3a00%2b0200&endTime=${nextDay}T00%3a00%3a00%2b0200`,
        responseType: "document",
        headers: {
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
            "Content-Type": "text/html;charset=UTF-8"
        },
        onload(response) {
            const doc = new DOMParser().parseFromString(response.responseText, "text/html");

            let currentDayTaskDurations = {};
            let currentTask = "None";
            let currentTaskOver210 = false;

            try {
                const taskSegments = Array.from(doc.getElementsByClassName("function-seg"));
                if (taskSegments.length > 0) {
                    taskSegments.forEach(segment => {
                        const taskElement = segment.children[0];
                        const durationElement = segment.children[3];

                        if (taskElement && durationElement) {
                            const taskNameParts = taskElement.innerText.split("\t", 4);
                            const taskName = taskNameParts.length > 3 ? taskNameParts[3].split("♦", 1)[0] : "Unknown Task";
                            const duration = durationElement.innerText;
                            const mins = parseInt(duration.split(":", 1)[0]);

                            if (!currentDayTaskDurations[taskName]) {
                                currentDayTaskDurations[taskName] = mins;
                            } else {
                                currentDayTaskDurations[taskName] += mins;
                            }

                            // Update the current task
                            currentTask = taskName;
                        }
                    });

                    currentTaskOver210 = currentDayTaskDurations[currentTask] >= 210;
                }
            } catch (error) {
                console.error('Error parsing current task:', error);
            }

            let currentTaskCell = document.createElement('td');
            currentTaskCell.innerText = currentTask;
            rows[index].value.appendChild(currentTaskCell);

            // Determine the color
            let color = "#78fa98"; // Default green color

            if (greenOverrideTasks.includes(currentTask)) {
                color = "#78fa98"; // Green override for specified tasks
            } else if (currentTask === "5S / Non Productive") {
                color = "#00FFFF"; // Cyan for 5S / Non Productive
            } else if (previousDayTaskDurations[currentTask] && currentTaskOver210 && previousDayTaskDurations[currentTask] >= 210 && !tasksExcludedFromRed.includes(currentTask)) {
                color = "#f77481"; // Red if both current and previous day tasks exceed 210 minutes
            } else if (previousDayTaskDurations[currentTask] && previousDayTaskDurations[currentTask] >= 210) {
                color = "#ffff99"; // Yellow if the previous day's task exceeded 210 minutes but doesn't meet red criteria
            }

            rows[index].value.style.backgroundColor = color;

            fetchPreviousDayTask(rows, index + 1);
        },
        onerror(e) {
            console.error(e);
        }
    });
}
