
/* ===== 側邊面板收合 ===== */
const sidebar = document.getElementById("sidebar");
const toggleButton = document.getElementById("toggleButton");

toggleButton.addEventListener("click", function () {
    const isCollapsed = sidebar.classList.toggle("collapsed");

    if (isCollapsed) {
        toggleButton.textContent = "◀";
        toggleButton.setAttribute("aria-label", "展開面板");
        toggleButton.title = "展開面板";
    } else {
        toggleButton.textContent = "▶";
        toggleButton.setAttribute("aria-label", "收起面板");
        toggleButton.title = "收起面板";
    }
});


/* ===== 場地選項設定 =====
   目前先使用預設範圍。
   之後加入場地設定功能時，可以改由使用者設定產生這些選項。
*/
const FIELD_OPTIONS = {
    frontMarks: [50, 45, 40, 35, 30],
    sideMarks: [0, 1, 2, 3, 4, 5, 6],
    sides: ["L", "R"],
    frontDirections: ["左", "右"],
    sideDirections: ["前", "後"],
};


/* ===== 判斷最外側碼線的方向限制 ===== */

// 前標數字由大到小排列：
// 最大值是最左側，最小值是最右側。
// 同一數字的 L 在左，R 在右。


function getAllowedFrontDirections(set) {
    const directions = [...FIELD_OPTIONS.frontDirections];

    const mark = Number(set.frontMark);
    const side = String(set.frontSide).toUpperCase();

    const outermostMark = Math.min(
        ...FIELD_OPTIONS.frontMarks.map(Number)
    );

    // 最外側碼線的 L 不能再往左。
    if (mark === outermostMark && side === "L") {
        return directions.filter(direction => direction !== "左");
    }

    // 最外側碼線的 R 不能再往右。
    if (mark === outermostMark && side === "R") {
        return directions.filter(direction => direction !== "右");
    }

    return directions;
}


function getAllowedSideDirections(set) {
    const marks = FIELD_OPTIONS.sideMarks;
    const frontmostMark = Math.min(...marks);
    const backmostMark = Math.max(...marks);

    let directions = [...FIELD_OPTIONS.sideDirections];

    if (set.sideMark === frontmostMark) {
        // 最前側碼線不能再往前。
        directions = directions.filter(
            direction => direction !== "前"
        );
    }

    if (set.sideMark === backmostMark) {
        // 最後側碼線不能再往後。
        directions = directions.filter(
            direction => direction !== "後"
        );
    }

    return directions;
}


/* ===== Set 資料 ===== */
let nextInternalId = 1;
let expandedSetId = 0;
let hoveredSidebarSetId = null;
let pendingDeleteSetId = null;
const hoveredFieldPointIds = new Set();
const stepTouched = new Set();

// 浮動提示不佔用 Set 列的版面空間。
const stepValidationPopup = document.createElement("div");
stepValidationPopup.className = "step-validation-popup";
stepValidationPopup.setAttribute("role", "alert");
stepValidationPopup.hidden = true;
document.body.appendChild(stepValidationPopup);

function hideStepValidationPopup() {
    stepValidationPopup.hidden = true;
    stepValidationPopup.textContent = "";
    stepValidationPopup.removeAttribute("style");
}

function showStepValidationPopup(input, message) {
    stepValidationPopup.textContent = message;
    stepValidationPopup.hidden = false;
    const rect = input.getBoundingClientRect();
    const popupWidth = Math.min(280, window.innerWidth - 24);
    let left = Math.min(rect.left, window.innerWidth - popupWidth - 12);
    left = Math.max(12, left);
    let top = rect.bottom + 6;
    // 靠近視窗底部時改顯示在欄位上方。
    stepValidationPopup.style.width = `${popupWidth}px`;
    stepValidationPopup.style.left = `${left}px`;
    if (top + stepValidationPopup.offsetHeight > window.innerHeight - 12) {
        top = Math.max(12, rect.top - stepValidationPopup.offsetHeight - 6);
    }
    stepValidationPopup.style.top = `${top}px`;
}


const sets = [
    createSet(0, "0")
];


/* 建立一個具有預設標點的 Set */
function createSet(id, label) {
    return {
        id: id,
        label: label,

        // 拍數設定
        counts: "",
        countType: "single",

        // 前標
        frontMark: 50,
        frontSide: null,
        frontDirection: "左",
        frontSteps: 0,

        // 側標
        sideMark: 0,
        sideDirection: "前",
        sideSteps: 0
    };
}


/* ===== HTML 輔助函式 ===== */
function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, function (character) {
        const entities = {
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        };

        return entities[character];
    });
}


/* 建立下拉選單 */
function createSelect(field, options, selectedValue, className, label) {
    const isBlank = selectedValue === "" || selectedValue === null || selectedValue === undefined;
    const blankOptionHtml = isBlank ? '<option value="" selected></option>' : "";
    const optionHtml = options.map(function (option) {
        const value = String(option);
        const selected = value === String(selectedValue)
            ? " selected"
            : "";

        return `
            <option value="${escapeHtml(value)}"${selected}>
                ${escapeHtml(value)}
            </option>
        `;
    }).join("");

    return `
        <select
            class="coordinate-select ${className}"
            data-field="${field}"
            aria-label="${label}">
            ${blankOptionHtml}${optionHtml}
        </select>
    `;
}


/* ===== 步數輸入與格式 ===== */
function formatStep(value) {
    if (isBlank(value)) return "";
    return String(Number(value));
}

function getEffectiveStepValue(value) {
    // 空白視為 0；像「1.」這種小數點後沒有數字的輸入，視為整數 1。
    if (isBlank(value)) return 0;
    const text = String(value).trim();
    if (/^\d+\.$/.test(text)) return Number(text.slice(0, -1));
    return Number(text);
}

function isValidStepValue(value) {
    if (isBlank(value)) return true;
    const text = String(value).trim();
    if (/^\d+\.$/.test(text)) {
        const integer = Number(text.slice(0, -1));
        return Number.isInteger(integer) && integer >= 0 && integer <= 4;
    }
    if (!/^(?:\d+(?:\.(?:00|0|25|5|50|75))?|\.(?:25|5|50|75))$/.test(text)) return false;
    const number = Number(text);
    if (!Number.isFinite(number) || number < 0 || number > 4) return false;
    return Math.abs(number * 4 - Math.round(number * 4)) < 1e-9;
}

function getStepValidationMessage(value) {
    if (isBlank(value) || /^\d+\.$/.test(String(value).trim()) && isValidStepValue(value)) return "";
    if (!/^(?:\d+(?:\.(?:00|0|25|5|50|75))?|\.(?:25|5|50|75))$/.test(String(value).trim())) {
        return "請輸入整數或以 0.25 為單位的小數（例如 2、2.25、2.5、2.75）。";
    }
    const number = Number(value);
    if (!Number.isFinite(number) || number < 0 || number > 4) return "步數必須介於 0～4。";
    if (Math.abs(number * 4 - Math.round(number * 4)) >= 1e-9) return "步數只能以 0.25 為增量。";
    return "";
}

function hasInvalidStepValue(set) {
    return !isValidStepValue(set.frontSteps) || !isValidStepValue(set.sideSteps);
}

/* ===== Set 摘要 ===== */
function getCoordinateSummary(set) {
    if (!hasCompleteCoordinates(set)) return "絕標不完整";

    // 若本 Set 的實際座標與前一張相同，收合列以「同前」簡化顯示。
    const setIndex = sets.findIndex(item => item.id === set.id);
    if (setIndex > 0) {
        const previousPoint = getNumericPoint(sets[setIndex - 1]);
        const currentPoint = getNumericPoint(set);
        if (
            previousPoint && currentPoint &&
            Math.abs(previousPoint.x - currentPoint.x) < 1e-9 &&
            Math.abs(previousPoint.y - currentPoint.y) < 1e-9
        ) {
            return "同前";
        }
    }

    let frontText = String(set.frontMark);

    // 50 是中央碼線，不顯示 L/R。
    if (set.frontMark !== 50 && set.frontSide !== null) {
        frontText += set.frontSide;
    }

    // 前標步數不是 0 時，才顯示方向和步數。
    if (getEffectiveStepValue(set.frontSteps) !== 0) {
        frontText += set.frontDirection;
        frontText += formatStep(set.frontSteps);
    }

    let sideText = String(set.sideMark);

    // 側標步數不是 0 時，才顯示方向和步數。
    if (Number(set.sideSteps) !== 0) {
        sideText += set.sideDirection;
        sideText += formatStep(set.sideSteps);
    }

    return `(${frontText}, ${sideText})`;
}


/* ===== Counts 換算成 Steps ===== */
function getStepsSummary(set) {
    if (
        set.counts === "" ||
        set.counts === null ||
        set.counts === undefined ||
        set.countType === "" ||
        set.countType === null ||
        set.countType === undefined
    ) {
        return "";
    }

    const counts = Number(set.counts);

    if (!Number.isFinite(counts)) {
        return "";
    }

    let steps;

    switch (set.countType) {
        case "half":
            steps = counts / 2;
            break;

        case "double":
            steps = counts * 2;
            break;

        case "single":
        default:
            steps = counts;
            break;
    }

    steps = Number(steps.toFixed(10));

    return `${steps} Steps`;
}

// 若本 Set 與前一個 Set 的絕標位置相同，收合列顯示 HOLD 與原始 Counts。
function getSetStepsSummary(set) {
    if (set.counts === "" || set.counts === null || set.counts === undefined) return "";

    const index = sets.findIndex(item => item.id === set.id);
    if (index > 0) {
        const previousPoint = getNumericPoint(sets[index - 1]);
        const currentPoint = getNumericPoint(set);
        if (
            previousPoint && currentPoint &&
            Math.abs(previousPoint.x - currentPoint.x) < 1e-9 &&
            Math.abs(previousPoint.y - currentPoint.y) < 1e-9
        ) {
            return `HOLD ${set.counts} cts`;
        }
    }

    return getStepsSummary(set);
}

function refreshSetStepsSummary(set) {
    const row = setList.querySelector(`.set-row[data-set-id="${set.id}"]`);
    const summary = row?.querySelector(".steps-summary");
    if (!summary) return;
    const text = getSetStepsSummary(set);
    summary.textContent = text;
    summary.hidden = text === "";
}


/* ===== 建立拍數輸入區 ===== */
function renderCountsFields(set) {
    return `
        <div class="counts-row">
            <label for="counts-${set.id}">Counts</label>

            <input
                id="counts-${set.id}"
                type="number"
                data-field="counts"
                data-set-id="${set.id}"
                value="${set.counts}"
            >

            <select
                data-field="countType"
                data-set-id="${set.id}"
            >
                ${set.countType === "" || set.countType === null || set.countType === undefined ? '<option value="" selected></option>' : ""}
                <option value="single"
                    ${set.countType === "single" ? "selected" : ""}>
                    Single time
                </option>
                <option value="half"
                    ${set.countType === "half" ? "selected" : ""}>
                    Half time
                </option>
                <option value="double"
                    ${set.countType === "double" ? "selected" : ""}>
                    Double time
                </option>
            </select>
        </div>
    `;
}


/* ===== 建立前標輸入區 ===== */
function renderStepInput(set, field, value, label) {
    return `
        <div class="step-input-wrapper">
            <div class="step-input-row">
                <div class="step-input-control">
                    <input
                        class="coordinate-select step-input"
                        type="text"
                        inputmode="decimal"
                        autocomplete="off"
                        spellcheck="false"
                        data-field="${field}"
                        aria-label="${label}"
                        aria-invalid="false"
                        value="${escapeHtml(value ?? "")}">
                    <span class="step-spinner" aria-label="調整步數">
                        <button type="button" class="step-spinner-button" data-step-adjust="up" data-step-field="${field}" aria-label="${label}增加 0.25 步" tabindex="-1">▲</button>
                        <button type="button" class="step-spinner-button" data-step-adjust="down" data-step-field="${field}" aria-label="${label}減少 0.25 步" tabindex="-1">▼</button>
                    </span>
                </div>
                <span class="step-input-unit">步</span>
            </div>
        </div>
    `;
}

function renderFrontFields(set) {
    const frontSideHtml = Number(set.frontMark) === 50
        ? ""
        : createSelect("frontSide", FIELD_OPTIONS.sides, set.frontSide || "L", "side-select", "前標左右側");

    return `
        <div class="coordinate-group">
            <div class="coordinate-title">前標</div>
            <div class="coordinate-fields">
                ${createSelect("frontMark", FIELD_OPTIONS.frontMarks, set.frontMark, "mark-number-select", "前標數字")}
                ${frontSideHtml}
                ${createSelect("frontDirection", getAllowedFrontDirections(set), set.frontDirection, "direction-select", "前標方向")}
                ${renderStepInput(set, "frontSteps", set.frontSteps, "前標離碼線步數")}
            </div>
        </div>
    `;
}

/* ===== 建立側標輸入區 ===== */
function renderSideFields(set) {
    return `
        <div class="coordinate-group">
            <div class="coordinate-title">側標</div>
            <div class="coordinate-fields">
                ${createSelect("sideMark", FIELD_OPTIONS.sideMarks, set.sideMark, "mark-number-select", "側標數字")}
                ${createSelect("sideDirection", getAllowedSideDirections(set), set.sideDirection, "direction-select", "側標方向")}
                ${renderStepInput(set, "sideSteps", set.sideSteps, "側標離碼線步數")}
            </div>
        </div>
    `;
}

/* ===== 建立單一 Set 介面 ===== */
function renderSet(set) {
    const isExpanded = set.id === expandedSetId;

    return `
        <article
            class="set-row ${isExpanded ? "expanded" : ""}"
            data-set-id="${set.id}">

            <button
                type="button"
                class="set-summary"
                aria-expanded="${isExpanded}"
                aria-label="編輯 Set #${escapeHtml(set.label)}">

                <span class="set-label-preview">
                    Set #${escapeHtml(set.label)}
                </span>

                <span class="coordinate-summary">
                    ${escapeHtml(getCoordinateSummary(set))}
                </span>

                <span class="steps-summary"
                        ${getSetStepsSummary(set) === "" ? "hidden" : ""}>
                    ${escapeHtml(getSetStepsSummary(set))}
                </span>

                <span class="set-chevron">
                    ${isExpanded ? "▼" : "◀"}
                </span>
            </button>

            ${isExpanded ? `
                <div class="set-details">
                    <div class="set-name-field">
                        <label for="set-name-${set.id}">
                            Set #
                        </label>

                        <input
                            id="set-name-${set.id}"
                            class="set-name-input"
                            type="text"
                            data-field="label"
                            value="${escapeHtml(set.label)}"
                            autocomplete="off">

                        <button type="button" class="delete-set-button" data-delete-set-id="${set.id}">刪除</button>
                    </div>

                    ${renderFrontFields(set)}
                    ${renderSideFields(set)}
                    ${sets[0]?.id === set.id ? "" : renderCountsFields(set)}
                </div>
            ` : ""}
        </article>
    `;
}


/* ===== 絕標座標換算與計算結果 ===== */

// 將數值整理成易讀格式：有限小數保留有效位數，較長的小數取至小數點後三位。
function formatNumber(value) {
    if (!Number.isFinite(value)) {
        return "";
    }

    if (Math.abs(value) < 1e-10) {
        return "0";
    }

    const nearestInteger = Math.round(value);
    if (Math.abs(value - nearestInteger) < 1e-10) {
        return String(nearestInteger);
    }

    const raw = String(value);
    const decimalPart = raw.includes(".") ? raw.split(".")[1].split("e")[0] : "";

    if (decimalPart.length > 6 || raw.includes("e-")) {
        return String(Number(value.toFixed(3)));
    }

    return String(Number(value.toFixed(6)));
}

function getFrontOffset(set) {
    return getEffectiveStepValue(set.frontSteps);
}

function getSideOffset(set) {
    return getEffectiveStepValue(set.sideSteps);
}

// X：50 為 0，左側為負、右側為正；每條相鄰前標相差 8 Steps。
// Y：側標 0 為 0，往後為正；每條相鄰側標相差 8 Steps。
function hasCompleteCoordinates(set) {
    const required = [set.frontMark, set.frontDirection, set.sideMark, set.sideDirection];
    if (required.some(value => value === "" || value === null || value === undefined)) return false;
    if (hasInvalidStepValue(set)) return false;
    if (Number(set.frontMark) !== 50 && (set.frontSide === "" || set.frontSide === null || set.frontSide === undefined)) return false;
    return true;
}

function getNumericPoint(set) {
    if (!hasCompleteCoordinates(set)) return null;
    const frontOffset = getFrontOffset(set);
    const frontBaseDistance = ((50 - Number(set.frontMark)) / 5) * 8;
    let x;

    if (Number(set.frontMark) === 50) {
        x = set.frontDirection === "左" ? -frontOffset : frontOffset;
    } else {
        const signedBase = String(set.frontSide).toUpperCase() === "L"
            ? -frontBaseDistance
            : frontBaseDistance;
        x = signedBase + (set.frontDirection === "左" ? -frontOffset : frontOffset);
    }

    const sideOffset = getSideOffset(set);
    const y = Number(set.sideMark) * 8 + (set.sideDirection === "前" ? -sideOffset : sideOffset);

    return { x, y };
}

function getTotalSteps(set) {
    if (set.counts === "" || set.counts === null || set.counts === undefined || set.countType === "" || set.countType === null || set.countType === undefined) {
        return null;
    }

    const counts = Number(set.counts);
    if (!Number.isFinite(counts)) {
        return null;
    }

    let steps;
    switch (set.countType) {
        case "half":
            steps = counts / 2;
            break;
        case "double":
            steps = counts * 2;
            break;
        case "single":
        default:
            steps = counts;
            break;
    }

    return Number.isFinite(steps) && steps > 0 ? steps : null;
}

function getFrontLinePositions() {
    const lines = [{ x: 0, label: "50" }];

    FIELD_OPTIONS.frontMarks.forEach(function (mark) {
        if (Number(mark) === 50) {
            return;
        }

        const distance = ((50 - Number(mark)) / 5) * 8;
        lines.push({ x: -distance, label: `${mark}L` });
        lines.push({ x: distance, label: `${mark}R` });
    });

    return lines;
}

function chooseNearestLine(lines, coordinate, startCoordinate) {
    let nearest = lines[0];
    let nearestDistance = Math.abs(coordinate - nearest.value);

    for (let i = 1; i < lines.length; i += 1) {
        const candidate = lines[i];
        const distance = Math.abs(coordinate - candidate.value);

        if (distance < nearestDistance - 1e-9) {
            nearest = candidate;
            nearestDistance = distance;
        } else if (Math.abs(distance - nearestDistance) <= 1e-9) {
            // 距離相同時，選擇沿起點方向較近的基準碼線。
            if (Math.abs(candidate.value - startCoordinate) < Math.abs(nearest.value - startCoordinate)) {
                nearest = candidate;
                nearestDistance = distance;
            }
        }
    }

    return nearest;
}

function formatAbsolutePoint(x, y, startPoint) {
    const frontLines = getFrontLinePositions().map(line => ({
        value: line.x,
        label: line.label
    }));
    const frontLine = chooseNearestLine(frontLines, x, startPoint.x);
    const frontDifference = x - frontLine.value;
    let frontText = frontLine.label;

    if (Math.abs(frontDifference) > 1e-9) {
        frontText += frontDifference < 0 ? "左" : "右";
        frontText += formatNumber(Math.abs(frontDifference));
    }

    const sideLines = FIELD_OPTIONS.sideMarks.map(mark => ({
        value: Number(mark) * 8,
        label: String(mark)
    }));
    const sideLine = chooseNearestLine(sideLines, y, startPoint.y);
    const sideDifference = y - sideLine.value;
    let sideText = sideLine.label;

    if (Math.abs(sideDifference) > 1e-9) {
        sideText += sideDifference < 0 ? "前" : "後";
        sideText += formatNumber(Math.abs(sideDifference));
    }

    return `(${frontText}, ${sideText})`;
}

function gcd(a, b) {
    while (b !== 0) {
        const remainder = a % b;
        a = b;
        b = remainder;
    }
    return a;
}

function getCrossingResults(startPoint, endPoint, totalSteps) {
    const deltaX = endPoint.x - startPoint.x;

    if (Math.abs(deltaX) < 1e-9) {
        return ["無"];
    }

    const crossings = getFrontLinePositions()
        .map(function (line) {
            return {
                label: line.label,
                lineX: line.x,
                progress: (line.x - startPoint.x) / deltaX
            };
        })
        // 不列出起點上的碼線；終點上的碼線要列出。
        .filter(item => item.progress > 1e-9 && item.progress <= 1 + 1e-9)
        .sort((a, b) => a.progress - b.progress);

    if (crossings.length === 0) {
        return ["無"];
    }

    return crossings.map(function (crossing) {
        const crossingStep = totalSteps * Math.min(crossing.progress, 1);
        // 若步數是無限小數，顯示到小數點後兩位；有限小數則保留原精度。
        const numerator = Math.round(totalSteps * (crossing.lineX - startPoint.x) * 4);
        const denominator = Math.round(deltaX * 4);
        let divisor = gcd(Math.abs(numerator), Math.abs(denominator));
        let reducedDenominator = Math.abs(denominator) / (divisor || 1);
        while (reducedDenominator % 2 === 0) reducedDenominator /= 2;
        while (reducedDenominator % 5 === 0) reducedDenominator /= 5;
        const isRepeating = reducedDenominator !== 1;
        const displayedStep = isRepeating
            ? String(Number(crossingStep.toFixed(2)))
            : formatNumber(crossingStep);
        const verb = Math.abs(crossing.progress - 1) <= 1e-9 ? "到" : "過";
        return `第 ${displayedStep} 步${verb} ${crossing.label}`;
    });
}

function renderCalculationBlock(startSet, endSet) {
    // 任一端 Set 的步數不合法，就只暫停這一對 Set 的計算。
    if (hasInvalidStepValue(startSet) || hasInvalidStepValue(endSet)) return "";
    const startPoint = getNumericPoint(startSet);
    const endPoint = getNumericPoint(endSet);
    if (!startPoint || !endPoint) return "";

    if (
        Math.abs(startPoint.x - endPoint.x) < 1e-9 &&
        Math.abs(startPoint.y - endPoint.y) < 1e-9
    ) {
        // 同一絕標位置代表立定，不需要計算步伐大小、中點或過碼線。
        if (endSet.counts === "" || endSet.counts === null || endSet.counts === undefined) return "";
        return `
            <div class="calculation-block hold-calculation" aria-label="Set #${escapeHtml(startSet.label)} 到 Set #${escapeHtml(endSet.label)}：立定">
                <span class="calculation-arrow" aria-hidden="true">
                    <svg viewBox="0 0 24 24" focusable="false">
                        <path d="M12 3v16M5 12l7 7 7-7" />
                    </svg>
                </span>
                <span class="calculation-hold">立定</span>
            </div>
        `;
    }

    const totalSteps = getTotalSteps(endSet);
    // Counts 未填或總步數不大於 0 時，整個計算區塊都不顯示。
    if (totalSteps === null) return "";

    const deltaX = endPoint.x - startPoint.x;
    const deltaY = endPoint.y - startPoint.y;
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    const stepSize = Math.round((distance / totalSteps) * 1000) / 1000;
    const midpointX = (startPoint.x + endPoint.x) / 2;
    const midpointY = (startPoint.y + endPoint.y) / 2;
    const midpoint = formatAbsolutePoint(midpointX, midpointY, startPoint);
    const crossings = getCrossingResults(startPoint, endPoint, totalSteps);

    return `
        <div class="calculation-block" aria-label="Set #${escapeHtml(startSet.label)} 到 Set #${escapeHtml(endSet.label)} 的計算結果">
            <span class="calculation-arrow" aria-hidden="true">
                <svg viewBox="0 0 24 24" focusable="false">
                    <path d="M12 3v16M5 12l7 7 7-7" />
                </svg>
            </span>
            <div class="calculation-line">
                <span class="calculation-label">步伐大小：</span><span>${formatNumber(stepSize)}步</span>
            </div>
            <div class="calculation-line">
                <span class="calculation-label">中點：</span><span>${escapeHtml(midpoint)}</span>
            </div>
            <div class="calculation-line crossing-calculation">
                <span class="calculation-label">過碼線：</span>
                <span class="crossing-values">
                    ${crossings.map(text => `<span>${escapeHtml(text)}</span>`).join("")}
                </span>
            </div>
        </div>
    `;
}

/* ===== 即時更新單一組計算結果，不重繪輸入欄位 ===== */
function refreshCalculationForPair(startSet, endSet) {
    const startRow = setList.querySelector(`.set-row[data-set-id="${startSet.id}"]`);
    const endRow = setList.querySelector(`.set-row[data-set-id="${endSet.id}"]`);

    if (!startRow || !endRow) {
        return;
    }

    const nextElement = startRow.nextElementSibling;
    const existingBlock = nextElement && nextElement.classList.contains("calculation-block")
        ? nextElement
        : null;
    const newBlockHtml = renderCalculationBlock(startSet, endSet);

    if (newBlockHtml) {
        if (existingBlock) {
            existingBlock.outerHTML = newBlockHtml;
        } else {
            startRow.insertAdjacentHTML("afterend", newBlockHtml);
        }
    } else if (existingBlock) {
        existingBlock.remove();
    }
}

/* ===== 更新整份 Set 清單 ===== */

const setList = document.getElementById("setList");
function renderSetList() {
    let html = "";

    sets.forEach(function (set, index) {
        html += renderSet(set);

        // 計算結果屬於相鄰兩個 Set，放在兩張絕標之間。
        if (index < sets.length - 1) {
            html += renderCalculationBlock(set, sets[index + 1]);
        }
    });

    // 新增按鈕固定放在最後一張絕標的下方。
    html += `
        <button
            type="button"
            class="add-set-button">
            新增絕標
        </button>
    `;

    setList.innerHTML = html;
    renderFieldGrid();
}


function getNextSetLabel() {
    let largestNumber = -1;

    sets.forEach(function (set) {
        // 從編號開頭讀取數字，例如 27A 會讀取為 27。
        const match = set.label.match(/^(\d+)/);

        if (match) {
            largestNumber = Math.max(
                largestNumber,
                Number(match[1])
            );
        }
    });

    return String(largestNumber + 1);
}


/* ===== 新增 Set ===== */
function addSet() {
    const newSet = createSet(
        nextInternalId,
        getNextSetLabel()
    );

    // 新增 Set 時沿用前一個 Set 的座標設定，但不複製 Counts 與 Count 類型。
    const previousSet = sets[sets.length - 1];
    if (previousSet) {
        [
            "frontMark",
            "frontSide",
            "frontDirection",
            "sideMark",
            "sideDirection"
        ].forEach(function (field) {
            newSet[field] = previousSet[field];
        });

        // 新增 Set 時保留方向與碼線設定，但前、側標步數預設清空。
        newSet.frontSteps = "";
        newSet.sideSteps = "";
    }

    nextInternalId += 1;

    sets.push(newSet);
    expandedSetId = newSet.id;

    renderSetList();

    // 讓新加入的 Set 出現在可視範圍內。
    const newRow = setList.querySelector(
        `[data-set-id="${newSet.id}"]`
    );

    if (newRow) {
        newRow.scrollIntoView({
            block: "nearest",
            behavior: "smooth"
        });
    }
}


/* ===== 點擊事件：展開、收合、新增 ===== */
setList.addEventListener("click", function (event) {
    const deleteButton = event.target.closest(".delete-set-button");
    if (deleteButton) {
        const deleteId = Number(deleteButton.dataset.deleteSetId);
        if (sets.length <= 1) {
            showFieldError("至少需要保留一張 Set，無法刪除最後一張。");
            return;
        }
        const targetSet = sets.find(item => item.id === deleteId);
        if (!targetSet) return;
        pendingDeleteSetId = deleteId;
        document.getElementById("deleteSetModalTitle").textContent = `確認刪除Set #${targetSet.label}？`;
        document.getElementById("deleteSetModal").hidden = false;
        return;
    }

    const addButton = event.target.closest(".add-set-button");

    if (addButton) {
        addSet();
        return;
    }

    const summary = event.target.closest(".set-summary");

    if (!summary) {
        return;
    }

    const row = summary.closest(".set-row");
    const clickedId = Number(row.dataset.setId);

    // 同一列再次點擊即可收合。
    expandedSetId = expandedSetId === clickedId
        ? null
        : clickedId;

    renderSetList();
});


/* ===== 輸入 Set 編號、拍數與步數 ===== */
setList.addEventListener("input", function (event) {
    const field = event.target.dataset.field;
    const row = event.target.closest(".set-row");
    if (!field || !row) return;

    const set = sets.find(item => item.id === Number(row.dataset.setId));
    if (!set) return;

    if (field === "label") {
        set.label = event.target.value;
        const preview = row.querySelector(".set-label-preview");
        if (preview) preview.textContent = `Set #${set.label}`;
        const summary = row.querySelector(".set-summary");
        if (summary) summary.setAttribute("aria-label", `編輯 Set #${set.label}`);
        renderFieldGrid();
        return;
    }

    if (field === "counts") {
        set.counts = event.target.value;
        refreshSetStepsSummary(set);
        const setIndex = sets.findIndex(item => item.id === set.id);
        if (setIndex > 0) refreshCalculationForPair(sets[setIndex - 1], set);
        renderFieldGrid();
        return;
    }

    if (field === "frontSteps" || field === "sideSteps") {
        set[field] = event.target.value;
        // 編輯中不顯示警告；提示只會在離開欄位時出現。
        hideStepValidationPopup();
        event.target.classList.remove("invalid");
        event.target.setAttribute("aria-invalid", "false");
        const summary = row.querySelector(".coordinate-summary");
        if (summary) summary.textContent = getCoordinateSummary(set);
        const setIndex = sets.findIndex(item => item.id === set.id);
        refreshSetStepsSummary(set);
        if (setIndex > 0) {
            refreshCalculationForPair(sets[setIndex - 1], set);
            refreshSetStepsSummary(set);
        }
        if (setIndex >= 0 && setIndex < sets.length - 1) {
            refreshCalculationForPair(set, sets[setIndex + 1]);
            refreshSetStepsSummary(sets[setIndex + 1]);
        }
        renderFieldGrid();
    }
});

// 步數欄位旁的上下按鈕：每次以 0.25 步增減，範圍限制在 0～4。
setList.addEventListener("mousedown", function (event) {
    if (event.target.closest(".step-spinner-button")) event.preventDefault();
});

setList.addEventListener("click", function (event) {
    const button = event.target.closest(".step-spinner-button");
    if (!button) return;

    const row = button.closest(".set-row");
    if (!row) return;
    const set = sets.find(item => item.id === Number(row.dataset.setId));
    if (!set) return;

    const field = button.dataset.stepField;
    const input = row.querySelector(`.step-input[data-field="${field}"]`);
    if (!input) return;

    const currentRaw = set[field];
    const current = isValidStepValue(currentRaw) ? getEffectiveStepValue(currentRaw) : 0;
    const delta = button.dataset.stepAdjust === "up" ? 0.25 : -0.25;
    const next = Math.min(4, Math.max(0, Math.round((current + delta) * 4) / 4));
    const nextText = String(next);

    set[field] = next;
    input.value = nextText;
    input.classList.remove("invalid");
    input.setAttribute("aria-invalid", "false");
    hideStepValidationPopup();

    const summary = row.querySelector(".coordinate-summary");
    if (summary) summary.textContent = getCoordinateSummary(set);
    const setIndex = sets.findIndex(item => item.id === set.id);
    refreshSetStepsSummary(set);
    if (setIndex > 0) {
        refreshCalculationForPair(sets[setIndex - 1], set);
        refreshSetStepsSummary(sets[setIndex - 1]);
    }
    if (setIndex >= 0 && setIndex < sets.length - 1) {
        refreshCalculationForPair(set, sets[setIndex + 1]);
        refreshSetStepsSummary(sets[setIndex + 1]);
    }
    // 按鈕調整步數時也即時更新左側場地圖，與鍵盤輸入保持一致。
    renderFieldGrid();
    input.focus({ preventScroll: true });
});

// 重新編輯時先收起提示，直到再次離開欄位才重新驗證顯示。
setList.addEventListener("focusin", function (event) {
    const field = event.target.dataset.field;
    if (field !== "frontSteps" && field !== "sideSteps") return;
    hideStepValidationPopup();
    event.target.classList.remove("invalid");
    event.target.setAttribute("aria-invalid", "false");
});

// 離開步數欄位才顯示驗證錯誤；空白可保留，但不完整絕標不會計算。
setList.addEventListener("focusout", function (event) {
    const field = event.target.dataset.field;
    if (field !== "frontSteps" && field !== "sideSteps") return;
    const row = event.target.closest(".set-row");
    if (!row) return;
    const set = sets.find(item => item.id === Number(row.dataset.setId));
    if (!set) return;

    const key = `${set.id}:${field}`;
    stepTouched.add(key);
    const message = getStepValidationMessage(set[field]);
    const invalid = Boolean(message);
    // 合法值離開欄位後，以數字型態存入內部資料；空白仍可顯示為空，但計算時視為 0。
    // 若輸入「1.」這類尾端小數點，則將內部值正規化為整數。
    if (!invalid && !isBlank(set[field])) set[field] = getEffectiveStepValue(set[field]);
    event.target.classList.toggle("invalid", invalid);
    event.target.setAttribute("aria-invalid", invalid ? "true" : "false");
    if (invalid) {
        showStepValidationPopup(event.target, message);
    } else {
        hideStepValidationPopup();
    }
    const setIndex = sets.findIndex(item => item.id === set.id);
    if (setIndex > 0) refreshCalculationForPair(sets[setIndex - 1], set);
    if (setIndex >= 0 && setIndex < sets.length - 1) refreshCalculationForPair(set, sets[setIndex + 1]);
});


/* ===== 下拉選單變更時更新資料 ===== */
setList.addEventListener("change", function (event) {
    const field = event.target.dataset.field;

    if (!field || field === "label" || field === "frontSteps" || field === "sideSteps") {
        return;
    }

    const row = event.target.closest(".set-row");

    if (!row) {
        return;
    }

    const set = sets.find(function (item) {
        return item.id === Number(row.dataset.setId);
    });

    if (!set) {
        return;
    }

    const value = event.target.value;

    switch (field) {
        case "counts":
            // Counts 已由 input 事件即時更新；失焦時不必重繪整份清單，
            // 否則會在使用者點擊其他按鈕前先替換掉被點擊的 DOM。
            set.counts = value;
            return;

        case "countType":
            set.countType = value;
            break;

        case "frontMark": {
            const previousMark = set.frontMark;
            set.frontMark = Number(value);

            if (set.frontMark === 50) {
                // 中央碼線不需要 R/L。
                set.frontSide = null;
            } else if (previousMark === 50 || set.frontSide === null) {
                // 從 50 切換到其他前標時，預設為 L。
                set.frontSide = "L";
            }

            break;
        }

        case "frontSide":
            set.frontSide = value;
            break;

        case "frontDirection":
            set.frontDirection = value;
            break;

        case "sideMark":
            set.sideMark = Number(value);
            break;

        case "sideDirection":
            set.sideDirection = value;
            break;

    }


    // 若變更碼線後，原本的方向不再合法，
    // 自動選擇該方向類別中第一個合法選項。
    const allowedFrontDirections =
        getAllowedFrontDirections(set);

    if (!allowedFrontDirections.includes(set.frontDirection)) {
        set.frontDirection = allowedFrontDirections[0];
    }

    const allowedSideDirections =
        getAllowedSideDirections(set);

    if (!allowedSideDirections.includes(set.sideDirection)) {
        set.sideDirection = allowedSideDirections[0];
    }


    // 延後整份清單重繪，讓目前這次滑鼠點擊能先正常送達目標元素。
    // 例如從下拉選單切換碼線後，直接點「新增絕標」或其他按鈕。
    renderFieldGrid();
    window.setTimeout(renderSetList, 0);
});


/* ===== 儲存與匯入絕標 ===== */
const saveSetsButton = document.getElementById("saveSetsButton");
const importSetsButton = document.getElementById("importSetsButton");
const importFileInput = document.getElementById("importFileInput");
const importModeModal = document.getElementById("importModeModal");
const appendImportButton = document.getElementById("appendImportButton");
const replaceImportButton = document.getElementById("replaceImportButton");
const cancelImportModeButton = document.getElementById("cancelImportModeButton");
let pendingImport = null;
let fieldModalContext = "normal";

function getBlankValue(value) {
    return value === undefined || value === null ? "" : value;
}

function getExportData() {
    return {
        field: {
            frontMarkRange: getCurrentFrontRange(),
            sideMarkRange: getCurrentSideRange()
        },
        sets: sets.map((set, index) => ({
            id: set.label,
            counts: index === 0 ? null : getBlankValue(set.counts),
            countType: getBlankValue(set.countType),
            frontMark: getBlankValue(set.frontMark),
            frontSide: getBlankValue(set.frontSide),
            frontDirection: getBlankValue(set.frontDirection),
            frontSteps: getBlankValue(set.frontSteps),
            sideMark: getBlankValue(set.sideMark),
            sideDirection: getBlankValue(set.sideDirection),
            sideSteps: getBlankValue(set.sideSteps)
        }))
    };
}

function getInvalidStepSets() {
    const invalid = [];
    sets.forEach(set => {
        const fields = [];
        if (!isValidStepValue(set.frontSteps)) fields.push("前標步數");
        if (!isValidStepValue(set.sideSteps)) fields.push("側標步數");
        if (fields.length) invalid.push(`Set #${set.label}（${fields.join("、")}）`);
    });
    return invalid;
}

async function saveSetsToFile() {
    const invalidSets = getInvalidStepSets();
    if (invalidSets.length) {
        window.alert(`目前還有不合法的步數，請修正後再儲存：\n${invalidSets.join("、")}`);
        return;
    }
    const json = JSON.stringify(getExportData(), null, 2);
    const blob = new Blob([json], { type: "application/json" });

    if (typeof window.showSaveFilePicker === "function") {
        try {
            const handle = await window.showSaveFilePicker({
                suggestedName: "drill.json",
                types: [{ description: "JSON 檔案", accept: { "application/json": [".json"] } }]
            });
            const writable = await handle.createWritable();
            await writable.write(blob);
            await writable.close();
            return;
        } catch (error) {
            if (error && error.name === "AbortError") return;
            // 不支援或無法使用選擇器時，退回一般下載。
        }
    }

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "drill.json";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}

saveSetsButton.addEventListener("click", saveSetsToFile);
importSetsButton.addEventListener("click", function () {
    importFileInput.value = "";
    importFileInput.click();
});

function showImportError(message) {
    window.alert(`無法匯入絕標：\n${message}\n\n目前的資料沒有變更。`);
}

function isBlank(value) {
    return value === "" || value === null || value === undefined;
}

function validEnumOrBlank(value, allowed) {
    return isBlank(value) || allowed.includes(String(value));
}

function normalizeImportedSet(raw, index) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
        throw new Error(`第 ${index + 1} 個 Set 的資料格式不正確。`);
    }
    if (!Object.prototype.hasOwnProperty.call(raw, "id") || isBlank(raw.id)) {
        throw new Error(`第 ${index + 1} 個 Set 缺少 Set 編號。`);
    }
    if (!Object.prototype.hasOwnProperty.call(raw, "frontSteps") || !Object.prototype.hasOwnProperty.call(raw, "sideSteps")) {
        throw new Error(`Set #${raw.id} 缺少新的前標或側標步數欄位。請使用新版 JSON。`);
    }

    const set = createSet(-1, String(raw.id));
    const fields = ["counts", "countType", "frontMark", "frontSide", "frontDirection", "frontSteps", "sideMark", "sideDirection", "sideSteps"];
    fields.forEach(field => { set[field] = getBlankValue(raw[field]); });

    if (!validEnumOrBlank(set.countType, ["single", "half", "double"])) throw new Error(`Set #${set.label} 的 Count 類型不合法。`);
    if (!isBlank(set.counts) && (!Number.isFinite(Number(set.counts)) || Number(set.counts) < 0)) throw new Error(`Set #${set.label} 的 Count 數值不合法。`);
    if (!isBlank(set.frontMark) && (!Number.isInteger(Number(set.frontMark)) || Number(set.frontMark) < 10 || Number(set.frontMark) > 50 || Number(set.frontMark) % 5 !== 0)) throw new Error(`Set #${set.label} 的前標數字不合法。`);
    if (!validEnumOrBlank(set.frontSide, ["L", "R"])) throw new Error(`Set #${set.label} 的前標左右側不合法。`);
    if (!validEnumOrBlank(set.frontDirection, FIELD_OPTIONS.frontDirections)) throw new Error(`Set #${set.label} 的前標方向不合法。`);
    if (!isBlank(set.frontSteps) && !isValidStepValue(set.frontSteps)) throw new Error(`Set #${set.label} 的前標步數不合法（必須介於 0～4，且以 0.25 為增量）。`);
    if (!isBlank(set.sideMark) && (!Number.isInteger(Number(set.sideMark)) || Number(set.sideMark) < 0 || Number(set.sideMark) > 8)) throw new Error(`Set #${set.label} 的側標數字不合法。`);
    if (!validEnumOrBlank(set.sideDirection, FIELD_OPTIONS.sideDirections)) throw new Error(`Set #${set.label} 的側標方向不合法。`);
    if (!isBlank(set.sideSteps) && !isValidStepValue(set.sideSteps)) throw new Error(`Set #${set.label} 的側標步數不合法（必須介於 0～4，且以 0.25 為增量）。`);

    ["counts", "frontMark", "sideMark", "frontSteps", "sideSteps"].forEach(field => {
        if (!isBlank(set[field])) set[field] = Number(set[field]);
    });
    set.frontSide = isBlank(set.frontSide) ? "" : String(set.frontSide).toUpperCase();
    return set;
}

function parseImportData(text) {
    let data;
    try { data = JSON.parse(text); }
    catch (_) { throw new Error("檔案不是有效的 JSON。 "); }
    if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("檔案最外層必須是物件。");
    if (!data.field || typeof data.field !== "object" || Array.isArray(data.field)) throw new Error("缺少場地設定。");
    if (!Array.isArray(data.sets) || data.sets.length === 0) throw new Error("Set 清單不存在或是空的。");

    const frontRange = Number(data.field.frontMarkRange);
    const sideRange = Number(data.field.sideMarkRange);
    if (!Number.isInteger(frontRange) || frontRange < 10 || frontRange > 45 || frontRange % 5 !== 0) throw new Error("檔案中的前標場地範圍不合法。");
    if (!Number.isInteger(sideRange) || sideRange < 1 || sideRange > 8) throw new Error("檔案中的側標場地範圍不合法。");

    const importedSets = data.sets.map(normalizeImportedSet);
    return { frontRange, sideRange, sets: importedSets };
}

importFileInput.addEventListener("change", async function () {
    const file = importFileInput.files && importFileInput.files[0];
    if (!file) return;
    try {
        const data = parseImportData(await file.text());
        pendingImport = data;
        importModeModal.hidden = false;
    } catch (error) {
        showImportError(error.message || "檔案內容不合法。");
    }
});

function closeImportModeModal() {
    importModeModal.hidden = true;
    pendingImport = null;
}

cancelImportModeButton.addEventListener("click", closeImportModeModal);
importModeModal.addEventListener("click", function (event) {
    if (event.target === importModeModal) closeImportModeModal();
});

appendImportButton.addEventListener("click", function () {
    if (!pendingImport) return;
    const data = pendingImport;
    closeImportModeModal();
    beginImport(data, "append");
});
replaceImportButton.addEventListener("click", function () {
    if (!pendingImport) return;
    const data = pendingImport;
    closeImportModeModal();
    beginImport(data, "replace");
});

function beginImport(data, mode) {
    const candidateSets = mode === "replace"
        ? data.sets.map(set => ({ ...set }))
        : [...sets.map(set => ({ ...set })), ...data.sets.map(set => ({ ...set }))];
    const targetFrontRange = mode === "replace" ? data.frontRange : getCurrentFrontRange();
    const targetSideRange = mode === "replace" ? data.sideRange : getCurrentSideRange();

    const outOfRange = getOutOfRangeImportedSets(candidateSets, targetFrontRange, targetSideRange);
    const candidate = { mode, sets: candidateSets, frontRange: targetFrontRange, sideRange: targetSideRange };
    if (outOfRange.length) {
        pendingImport = candidate;
        fieldModalContext = "import";
        openFieldModal(targetFrontRange, targetSideRange);
        showFieldError(`以下絕標超出目前場地範圍：${outOfRange.join("、")}。\n請調整場地大小，或按「取消」放棄整次匯入。`);
        return;
    }
    commitImport(candidate);
}

// 判斷絕標是否超出指定場地範圍，使用實際座標（包含方向與步數）。
function isSetOutsideFieldRange(set, frontRange, sideRange) {
    // 先保留碼線數字層級的檢查，避免座標尚未填完整時漏掉超出範圍的碼線。
    if ((!isBlank(set.frontMark) && Number(set.frontMark) < frontRange) ||
        (!isBlank(set.sideMark) && Number(set.sideMark) > sideRange)) {
        return true;
    }

    const point = getNumericPoint(set);
    if (!point) return false;

    // 50 為中心，每隔 5 碼線是 8 Steps；左側為負，右側為正。
    const frontBoundary = ((50 - frontRange) / 5) * 8;
    const sideBoundary = sideRange * 8;

    return point.x < -frontBoundary || point.x > frontBoundary ||
        point.y < 0 || point.y > sideBoundary;
}

function getOutOfRangeImportedSets(candidateSets, frontRange, sideRange) {
    return candidateSets.filter(set =>
        isSetOutsideFieldRange(set, frontRange, sideRange)
    ).map(set => `Set #${set.label}`);
}

function commitImport(candidate) {
    const frontRange = candidate.frontRange;
    const sideRange = candidate.sideRange;
    const newFrontMarks = [];
    for (let mark = 50; mark >= frontRange; mark -= 5) newFrontMarks.push(mark);
    const newSideMarks = [];
    for (let mark = 0; mark <= sideRange; mark++) newSideMarks.push(mark);

    FIELD_OPTIONS.frontMarks = newFrontMarks;
    FIELD_OPTIONS.sideMarks = newSideMarks;
    sets.splice(0, sets.length);
    candidate.sets.forEach(set => {
        const imported = { ...set, id: nextInternalId++ };
        sets.push(imported);
    });
    expandedSetId = null;
    stepTouched.clear();
    pendingImport = null;
    fieldModalContext = "normal";
    renderSetList();
    renderFieldGrid();
}

/* ===== 場地座標網格與圖點 ===== */
// 每個 Set 保留最後一次合法座標；輸入暫時不合法時，圖點不會跳動。
const lastValidFieldPoints = new Map();

function renderFieldGrid() {
    const host = document.getElementById("fieldDrawing");
    if (!host) return;
    const frontRange = getCurrentFrontRange();
    const sideRange = getCurrentSideRange();
    const intervalsWide = ((50 - frontRange) / 5) * 2;
    const cell = 12;
    const cols = intervalsWide * 8;
    const rows = sideRange * 8;

    // 文字與留白以螢幕像素為準，調整場地範圍時不跟著縮放。
    const hostWidth = Math.max(host.clientWidth || 800, 320);
    const hostHeight = Math.max(host.clientHeight || 600, 240);
    const padX = 38, padTop = 58, padBottom = 42;
    const scale = Math.min(
        hostWidth / (cols * cell + padX * 2),
        hostHeight / (rows * cell + padTop + padBottom)
    );
    const unit = 1 / Math.max(scale, 0.01);
    const left = padX * unit, top = padTop * unit, right = padX * unit, bottom = padBottom * unit;
    const width = left + cols * cell + right;
    const height = top + rows * cell + bottom;
    const esc = value => String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;");
    let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="場地座標網格">`;
    svg += `<text x="${width/2}" y="${16*unit}" text-anchor="middle" font-size="${12*unit}" font-weight="500" fill="#111111">Director Viewpoint</text>`;
    svg += `<rect x="${left}" y="${top}" width="${cols*cell}" height="${rows*cell}" fill="#fff" stroke="#111111" stroke-width="1.2"/>`;
    for (let c = 1; c < cols; c++) {
        const yardline = c % 8 === 0;
        const halfway = c % 4 === 0;
        const color = yardline ? "#222222" : (halfway ? "#58bed7" : "#58bed7");
        const sw = yardline ? 1.2 : halfway ? 1.2 : 0.35;
        const x = left + c * cell;
        svg += `<line x1="${x}" y1="${top}" x2="${x}" y2="${top+rows*cell}" stroke="${color}" stroke-width="${sw}"/>`;
    }
    for (let r = 1; r < rows; r++) {
        const sideLine = r % 8 === 0;
        const halfway = r % 4 === 0;
        const color = sideLine ? "#222222" : (halfway ? "#58bed7" : "#58bed7");
        const sw = sideLine ? 1.2 : halfway ? 1.2 : 0.35;
        const y = top + r * cell;
        svg += `<line x1="${left}" y1="${y}" x2="${left+cols*cell}" y2="${y}" stroke="${color}" stroke-width="${sw}"/>`;
    }
    for (let i = 0; i <= intervalsWide; i++) {
        const x = left + i * 8 * cell;
        const mid = intervalsWide / 2;
        let label;
        if (i < mid) label = `${frontRange + i * 5}L`;
        else if (i === mid) label = "50";
        else label = `${50 - (i - mid) * 5}R`;
        svg += `<text x="${x}" y="${top-8*unit}" text-anchor="middle" font-size="${17*unit}" font-weight="700" fill="#080808">${esc(label)}</text>`;
        svg += `<text x="${x}" y="${top+rows*cell+22*unit}" text-anchor="middle" font-size="${17*unit}" font-weight="700" fill="#080808">${esc(label)}</text>`;
    }
    for (let i = 0; i <= sideRange; i++) {
        const y = top + i * 8 * cell;
        svg += `<text x="${left-17*unit}" y="${y+5*unit}" text-anchor="end" font-size="${17*unit}" font-weight="700" fill="#080808">${i}</text>`;
        svg += `<text x="${left+cols*cell+17*unit}" y="${y+5*unit}" text-anchor="start" font-size="${17*unit}" font-weight="700" fill="#080808">${i}</text>`;
    }

    // 只在座標完整、步數合法且落在目前場地內時更新最後合法位置。
    sets.forEach(function (set) {
        const point = getNumericPoint(set);
        if (!point) return;
        const minX = -cols / 2;
        const maxX = cols / 2;
        if (point.x < minX || point.x > maxX || point.y < 0 || point.y > rows) return;
        lastValidFieldPoints.set(set.id, { x: point.x, y: point.y });
    });

    // 箭頭連接每個 Set 與下一個 Set；沿用最後一次合法的位置。
    svg += `<defs><marker id="fieldMoveArrowHead" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto" markerUnits="userSpaceOnUse"><path d="M0,0 L6,3 L0,6 Z" fill="#43A047"/></marker></defs>`;
    const plottedSets = sets.map(set => ({ set, point: lastValidFieldPoints.get(set.id) }));
    for (let i = 0; i < plottedSets.length - 1; i++) {
        const a = plottedSets[i].point;
        const b = plottedSets[i + 1].point;
        if (!a || !b) continue;
        if (a.x === b.x && a.y === b.y) continue;
        const x1 = left + (cols / 2 + a.x) * cell;
        const y1 = top + a.y * cell;
        const x2 = left + (cols / 2 + b.x) * cell;
        const y2 = top + b.y * cell;
        const dx = x2 - x1, dy = y2 - y1;
        const distance = Math.hypot(dx, dy);
        const startGap = 3.8 * unit;
        const endGap = 5.4 * unit;
        if (distance <= startGap + endGap) continue;
        const ux = dx / distance, uy = dy / distance;
        svg += `<line x1="${x1 + ux * startGap}" y1="${y1 + uy * startGap}" x2="${x2 - ux * endGap}" y2="${y2 - uy * endGap}" stroke="#43A047" stroke-width="1.1" marker-end="url(#fieldMoveArrowHead)" pointer-events="none"/>`;
    }

    // 同一位置的連續 Set 只列出該連續段的第一個 Set；若之後再次回到該位置，則追加列出。
    const coordinateKey = point => `${point.x},${point.y}`;
    const labelsByCoordinate = new Map();
    let previousKey = null;
    sets.forEach(set => {
        const point = lastValidFieldPoints.get(set.id);
        if (!point) { previousKey = null; return; }
        const key = coordinateKey(point);
        if (!labelsByCoordinate.has(key)) labelsByCoordinate.set(key, []);
        if (key !== previousKey) labelsByCoordinate.get(key).push(`Set #${set.label}`);
        previousKey = key;
    });

    // 圖點平常顯示較小的鮮紅實心圓；第一個與最後一個 Set 改用星星辨識。
    sets.forEach(function (set, index) {
        const point = lastValidFieldPoints.get(set.id);
        if (!point) return;
        const x = left + (cols / 2 + point.x) * cell;
        const y = top + point.y * cell;
        const radius = 3.2 * unit;
        const labelText = (labelsByCoordinate.get(coordinateKey(point)) || [`Set #${set.label}`]).join(", ");
        const label = esc(labelText);
        const isEndpoint = index === 0 || index === sets.length - 1;
        svg += `<g class="field-set-point-group${isEndpoint ? ' field-set-endpoint' : ''}" tabindex="0" role="img" aria-label="${label}" data-set-id="${esc(set.id)}">`;
        svg += `<circle cx="${x}" cy="${y}" r="${radius + 2.2*unit}" fill="none" stroke="#FFB000" stroke-width="${2.2*unit}" class="field-set-point-ring"/>`;
        if (isEndpoint) {
            const outer = 5.2 * unit, inner = 2.5 * unit;
            const pts = Array.from({length:10}, (_, i) => {
                const angle = -Math.PI/2 + i*Math.PI/5;
                const r = i % 2 === 0 ? outer : inner;
                return `${x + Math.cos(angle)*r},${y + Math.sin(angle)*r}`;
            }).join(" ");
            svg += `<polygon points="${pts}" fill="#FF2424" stroke="#FFFFFF" stroke-width="${0.6*unit}" class="field-set-point field-set-point-star"/>`;
        } else {
            svg += `<circle cx="${x}" cy="${y}" r="${radius}" fill="#FF2424" stroke="#FFFFFF" stroke-width="${0.6*unit}" class="field-set-point"/>`;
        }
        svg += `</g>`;
    });

    // 將所有提示框集中放在 SVG 最上層，避免被其他圖點或外圈遮住。
    svg += `<g class="field-set-tooltip-layer">`;
    sets.forEach(function (set) {
        const point = lastValidFieldPoints.get(set.id);
        if (!point) return;
        const x = left + (cols / 2 + point.x) * cell;
        const y = top + point.y * cell;
        const radius = (sets.indexOf(set) === 0 || sets.indexOf(set) === sets.length - 1 ? 5.2 : 3.2) * unit;
        const labelText = (labelsByCoordinate.get(coordinateKey(point)) || [`Set #${set.label}`]).join(", ");
        const label = esc(labelText);
        const tooltipFont = 12 * unit;
        const tooltipPadding = 5 * unit;
        const tooltipWidth = Math.max(48 * unit, labelText.length * 7 * unit + tooltipPadding * 2);
        const tooltipHeight = tooltipFont + tooltipPadding * 2;
        const tooltipX = x - tooltipWidth / 2;
        const tooltipY = y - radius - tooltipHeight - 7 * unit;
        svg += `<g class="field-set-tooltip" data-tooltip-for="${esc(set.id)}">`;
        svg += `<rect x="${tooltipX}" y="${tooltipY}" width="${tooltipWidth}" height="${tooltipHeight}" rx="${4*unit}" fill="#222222"/>`;
        svg += `<text x="${x}" y="${tooltipY + tooltipPadding + tooltipFont * 0.82}" text-anchor="middle" font-size="${tooltipFont}" font-weight="600" fill="#FFFFFF">${label}</text>`;
        svg += `</g>`;
    });
    svg += `</g>`;

    // 清除已刪除 Set 的暫存位置，避免舊圖點殘留在資料中。
    const activeIds = new Set(sets.map(set => set.id));
    for (const id of lastValidFieldPoints.keys()) {
        if (!activeIds.has(id)) lastValidFieldPoints.delete(id);
    }

    svg += `</svg>`;
    // 保留場地圖右上角的下載按鈕；重繪網格前先取出，避免 innerHTML 覆蓋掉它。
    const downloadButton = host.querySelector("#downloadImageButton");
    host.innerHTML = svg;
    if (downloadButton) host.appendChild(downloadButton);
    const svgRoot = host.querySelector("svg");
    if (svgRoot) {
        // 編輯區展開時，點擊左側場地圖的空白處即可收合；點擊其他圖點則保留原本行為。
        svgRoot.addEventListener("click", event => {
            if (event.target.closest(".field-set-point-group")) return;
            if (expandedSetId !== null) {
                expandedSetId = null;
                renderSetList();
                updateFieldPointHighlights();
            }
        });
        svgRoot.querySelectorAll(".field-set-point-group").forEach(group => {
            const id = Number(group.getAttribute("data-set-id"));
            group.addEventListener("click", () => {
                // 同一位置的連續 Set 視為同一段，只取該段第一個 Set；
                // 若有多段不連續 Set 共用此位置，讓使用者選擇要開啟哪一段。
                const clickedPoint = lastValidFieldPoints.get(id);
                if (!clickedPoint) return;
                const samePointSets = sets.filter(candidate => {
                    const candidatePoint = lastValidFieldPoints.get(candidate.id);
                    return candidatePoint &&
                        candidatePoint.x === clickedPoint.x &&
                        candidatePoint.y === clickedPoint.y;
                });
                const firstOfRuns = [];
                let previousIndex = -2;
                samePointSets.forEach(candidate => {
                    const index = sets.findIndex(item => item.id === candidate.id);
                    if (index !== previousIndex + 1) firstOfRuns.push(candidate);
                    previousIndex = index;
                });

                // 若這個位置的任一個 Set 已展開，優先收合它；只有全部收合時才詢問選擇。
                const expandedAtThisPoint = samePointSets.find(candidate => candidate.id === expandedSetId);
                if (expandedAtThisPoint) {
                    toggleAndFocusSet(expandedAtThisPoint.id);
                    return;
                }

                if (firstOfRuns.length > 1) {
                    openPointSetChoiceModal(firstOfRuns);
                    return;
                }
                toggleAndFocusSet(firstOfRuns[0]?.id ?? id);
            });
            group.addEventListener("mouseenter", () => {
                hoveredFieldPointIds.add(id);
                updateFieldPointHighlights();
            });
            group.addEventListener("mouseleave", () => {
                hoveredFieldPointIds.delete(id);
                updateFieldPointHighlights();
            });
            group.addEventListener("focus", () => {
                hoveredFieldPointIds.add(id);
                updateFieldPointHighlights();
            });
            group.addEventListener("blur", () => {
                hoveredFieldPointIds.delete(id);
                updateFieldPointHighlights();
            });
        });
        updateFieldPointHighlights();
    }
}

function toggleAndFocusSet(id) {
    // 若該 Set 已展開，再點一次圖點就收合；否則展開並捲動到收合列。
    expandedSetId = expandedSetId === id ? null : id;
    renderSetList();
    if (expandedSetId === null) return;
    window.requestAnimationFrame(() => {
        const summary = setList.querySelector(`.set-row[data-set-id="${id}"] .set-summary`);
        const scrollContainer = setList.closest(".panel-content");
        if (!summary || !scrollContainer) return;

        // 由左側圖點開啟時，盡量將收合列對齊資料區頂端；接近清單底部時自然停在最底端。
        const containerRect = scrollContainer.getBoundingClientRect();
        const summaryRect = summary.getBoundingClientRect();
        const desiredScrollTop = scrollContainer.scrollTop + summaryRect.top - containerRect.top;
        const maxScrollTop = scrollContainer.scrollHeight - scrollContainer.clientHeight;
        scrollContainer.scrollTo({
            top: Math.min(Math.max(0, desiredScrollTop), maxScrollTop),
            behavior: "smooth"
        });
    });
}

const pointSetChoiceModal = document.getElementById("pointSetChoiceModal");
const pointSetChoiceOptions = document.getElementById("pointSetChoiceOptions");
const cancelPointSetChoiceButton = document.getElementById("cancelPointSetChoiceButton");
const confirmPointSetChoiceButton = document.getElementById("confirmPointSetChoiceButton");
let pendingPointSetChoiceIds = [];

function openPointSetChoiceModal(options) {
    pendingPointSetChoiceIds = options.map(set => set.id);
    pointSetChoiceOptions.innerHTML = options.map((set, index) => `
        <label class="point-set-choice-option">
            <input type="radio" name="pointSetChoice" value="${set.id}" ${index === 0 ? "checked" : ""}>
            <span>檢視 Set #${escapeHtml(set.label)}</span>
        </label>
    `).join("");
    pointSetChoiceModal.hidden = false;
}

function closePointSetChoiceModal() {
    pointSetChoiceModal.hidden = true;
    pendingPointSetChoiceIds = [];
}

cancelPointSetChoiceButton.addEventListener("click", closePointSetChoiceModal);
pointSetChoiceModal.addEventListener("click", event => {
    if (event.target === pointSetChoiceModal) closePointSetChoiceModal();
});
confirmPointSetChoiceButton.addEventListener("click", () => {
    const selected = pointSetChoiceOptions.querySelector('input[name="pointSetChoice"]:checked');
    const id = Number(selected?.value);
    if (!pendingPointSetChoiceIds.includes(id)) return;
    closePointSetChoiceModal();
    toggleAndFocusSet(id);
});

function updateFieldPointHighlights() {
    const host = document.getElementById("fieldDrawing");
    const svgRoot = host?.querySelector("svg");
    if (!svgRoot) return;
    svgRoot.querySelectorAll(".field-set-point-group").forEach(group => {
        const id = Number(group.getAttribute("data-set-id"));
        const isHighlighted = id === expandedSetId || id === hoveredSidebarSetId;
        const isFieldHovered = hoveredFieldPointIds.has(id);
        const ring = group.querySelector(".field-set-point-ring");
        const tooltip = svgRoot.querySelector(`[data-tooltip-for="${CSS.escape(String(id))}"]`);
        group.classList.toggle("is-highlighted", isHighlighted);
        if (ring) ring.style.opacity = (isHighlighted || isFieldHovered) ? "1" : "0";
        if (tooltip) tooltip.classList.toggle("is-visible", isHighlighted || isFieldHovered);
    });
}

/* ===== 刪除 Set 確認視窗 ===== */
const deleteSetModal = document.getElementById("deleteSetModal");
const cancelDeleteSetButton = document.getElementById("cancelDeleteSetButton");
const confirmDeleteSetButton = document.getElementById("confirmDeleteSetButton");

cancelDeleteSetButton.addEventListener("click", function () {
    pendingDeleteSetId = null;
    deleteSetModal.hidden = true;
});

confirmDeleteSetButton.addEventListener("click", function () {
    const deleteId = pendingDeleteSetId;
    pendingDeleteSetId = null;
    deleteSetModal.hidden = true;
    if (deleteId === null || sets.length <= 1) return;
    const deleteIndex = sets.findIndex(item => item.id === deleteId);
    if (deleteIndex < 0) return;
    sets.splice(deleteIndex, 1);
    if (expandedSetId === deleteId) {
        expandedSetId = sets[Math.min(deleteIndex, sets.length - 1)]?.id ?? null;
    }
    if (hoveredSidebarSetId === deleteId) hoveredSidebarSetId = null;
    renderSetList();
});

/* ===== 側邊 Set 列與場地圖點同步醒目標示 ===== */
setList.addEventListener("mouseover", function (event) {
    const summary = event.target.closest(".set-summary");
    const row = summary?.closest(".set-row");
    if (!row) return;
    const id = Number(row.dataset.setId);
    if (hoveredSidebarSetId === id) return;
    hoveredSidebarSetId = id;
    updateFieldPointHighlights();
});

setList.addEventListener("mouseout", function (event) {
    const summary = event.target.closest(".set-summary");
    const row = summary?.closest(".set-row");
    if (!row || (event.relatedTarget && summary.contains(event.relatedTarget))) return;
    if (hoveredSidebarSetId !== Number(row.dataset.setId)) return;
    hoveredSidebarSetId = null;
    updateFieldPointHighlights();
});

/* ===== 初始畫面 ===== */
renderFieldGrid();
renderSetList();


/* ===== 場地大小設定視窗 ===== */
const fieldModal = document.getElementById("fieldModal");
const fieldForm = document.getElementById("fieldForm");
const frontRangeInput = document.getElementById("frontRangeInput");
const sideRangeInput = document.getElementById("sideRangeInput");
const fieldError = document.getElementById("fieldError");

const resizeFieldButton = document.getElementById("resizeFieldButton");
const cancelFieldButton = document.getElementById("cancelFieldButton");

function getCurrentFrontRange() {
    return Math.min(...FIELD_OPTIONS.frontMarks);
}

function getCurrentSideRange() {
    return Math.max(...FIELD_OPTIONS.sideMarks);
}

function openFieldModal(frontRange = getCurrentFrontRange(), sideRange = getCurrentSideRange()) {
    frontRangeInput.value = frontRange;
    sideRangeInput.value = sideRange;

    fieldError.textContent = "";
    fieldError.hidden = true;

    fieldModal.hidden = false;
    frontRangeInput.focus();
}

function closeFieldModal() {
    fieldModal.hidden = true;
}

resizeFieldButton.addEventListener("click", function () { openFieldModal(); });
cancelFieldButton.addEventListener("click", function () {
    closeFieldModal();
    if (fieldModalContext === "import") {
        pendingImport = null;
        fieldModalContext = "normal";
    }
});

// 點擊視窗外側也可以關閉。
fieldModal.addEventListener("click", function (event) {
    if (event.target === fieldModal) {
        closeFieldModal();
        if (fieldModalContext === "import") {
            pendingImport = null;
            fieldModalContext = "normal";
        }
    }
});

function showFieldError(message) {
    fieldError.textContent = message;
    fieldError.hidden = false;
}

fieldForm.addEventListener("submit", function (event) {
    event.preventDefault();

    const frontRange = Number(frontRangeInput.value);
    const sideRange = Number(sideRangeInput.value);

    // 驗證前標範圍。
    if (
        !Number.isInteger(frontRange) ||
        frontRange < 10 ||
        frontRange > 45 ||
        frontRange % 5 !== 0
    ) {
        showFieldError(
            "前標範圍必須是 10～45 之間的 5 的倍數。"
        );
        return;
    }

    // 驗證側標範圍。
    if (
        !Number.isInteger(sideRange) ||
        sideRange < 1 ||
        sideRange > 8
    ) {
        showFieldError(
            "側標範圍必須是 1～8 之間的整數。"
        );
        return;
    }

    // 匯入流程使用暫存資料驗證，避免在匯入成功前改動目前資料。
    if (fieldModalContext === "import" && pendingImport) {
        const outOfRangeNames = getOutOfRangeImportedSets(pendingImport.sets, frontRange, sideRange);
        if (outOfRangeNames.length > 0) {
            showFieldError(`以下絕標仍超出新的場地範圍：${outOfRangeNames.join("、")}。\n請繼續調整，或按「取消」放棄整次匯入。`);
            return;
        }
        pendingImport.frontRange = frontRange;
        pendingImport.sideRange = sideRange;
        const candidate = pendingImport;
        closeFieldModal();
        commitImport(candidate);
        return;
    }

    // 找出套用新範圍後會超出場地的既有絕標。
    const outOfRangeSets = sets.filter(function (set) {
        return isSetOutsideFieldRange(set, frontRange, sideRange);
    });

    if (outOfRangeSets.length > 0) {
        const setNames = outOfRangeSets.map(set => `Set #${set.label}`).join("、");
        showFieldError(`以下絕標超出新的場地範圍：${setNames}。\n請先修改以上絕標，再重新調整場地大小。`);
        return;
    }

    // 產生新的前標與側標選項。
    const newFrontMarks = [];

    for (let mark = 50; mark >= frontRange; mark -= 5) {
        newFrontMarks.push(mark);
    }

    const newSideMarks = [];

    for (let mark = 0; mark <= sideRange; mark++) {
        newSideMarks.push(mark);
    }

    // 更新共用設定，讓所有相關下拉選單使用新範圍。
    FIELD_OPTIONS.frontMarks = newFrontMarks;
    FIELD_OPTIONS.sideMarks = newSideMarks;

    // 關閉視窗並重新繪製 Set 清單。
    closeFieldModal();
    renderSetList();
    renderFieldGrid();
});

window.addEventListener("resize", renderFieldGrid);

// 將目前左側場地圖匯出為 PNG 圖片。
const downloadImageButton = document.getElementById("downloadImageButton");
if (downloadImageButton) {
    downloadImageButton.addEventListener("click", function () {
        const svgRoot = document.querySelector("#fieldDrawing svg");
        if (!svgRoot) return;

        const clone = svgRoot.cloneNode(true);
        // 匯出圖片時不包含互動用的懸浮提示框。
        clone.querySelectorAll(".field-set-tooltip, .field-set-point-ring").forEach(element => element.remove());
        clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
        const viewBox = (clone.getAttribute("viewBox") || "0 0 800 600").trim().split(/[ ,]+/).map(Number);
        const sourceWidth = viewBox[2] || 800;
        const sourceHeight = viewBox[3] || 600;
        const scale = 2;
        clone.setAttribute("width", String(Math.round(sourceWidth * scale)));
        clone.setAttribute("height", String(Math.round(sourceHeight * scale)));

        const svgBlob = new Blob([new XMLSerializer().serializeToString(clone)], { type: "image/svg+xml;charset=utf-8" });
        const objectUrl = URL.createObjectURL(svgBlob);
        const image = new Image();
        image.onload = function () {
            const canvas = document.createElement("canvas");
            canvas.width = Math.round(sourceWidth * scale);
            canvas.height = Math.round(sourceHeight * scale);
            const context = canvas.getContext("2d");
            if (!context) { URL.revokeObjectURL(objectUrl); return; }
            context.fillStyle = "#FFFFFF";
            context.fillRect(0, 0, canvas.width, canvas.height);
            context.drawImage(image, 0, 0, canvas.width, canvas.height);
            URL.revokeObjectURL(objectUrl);
            canvas.toBlob(function (pngBlob) {
                if (!pngBlob) return;
                const link = document.createElement("a");
                const downloadUrl = URL.createObjectURL(pngBlob);
                link.href = downloadUrl;
                link.download = "drill.png";
                document.body.appendChild(link);
                link.click();
                link.remove();
                setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
            }, "image/png");
        };
        image.onerror = function () {
            URL.revokeObjectURL(objectUrl);
            alert("圖片匯出失敗，請再試一次。");
        };
        image.src = objectUrl;
    });
}

