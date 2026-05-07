let currentEditTableId = 1;
let editTableData = null;
let unmappedColumns = [];
let columnUnitSelections = {};
let llmGeneratedData = null;

const unitPatterns = [
    { regex: /[\(\[]mg[\)\]]/, unit: 'mg' },
    { regex: /[\(\[]mmol[\)\]]/, unit: 'mmol' },
    { regex: /[\(\[]eq[\)\]]/, unit: 'eq' },
    { regex: /[\(\[]uL[\)\]]/, unit: 'uL' },
    { regex: /[\(\[]mL[\)\]]/, unit: 'mL' },
    { regex: /[\(\[]%[\)\]]/, unit: '%' },
    { regex: /[\(\[]h[\)\]]/, unit: 'h' },
    { regex: /[\(\[]c[\)\]]/, unit: 'c' },
    { regex: /[\(\[]atm[\)\]]/, unit: 'atm' },
    { regex: /[\(\[]nm[\)\]]/, unit: 'nm' },
];

function getColumnBaseName(col) {
    let baseName = col;
    for (const { regex } of unitPatterns) {
        baseName = baseName.replace(regex, '').trim();
    }
    baseName = baseName.replace(/\s*\d+$/, '');
    return baseName.trim();
}

function getColumnUnit(col) {
    for (const { regex, unit } of unitPatterns) {
        if (regex.test(col)) {
            return unit;
        }
    }
    return null;
}

function getColumnNumber(col) {
    const match = col.match(/\d+$/);
    return match ? parseInt(match[0]) : 1;
}

function groupColumnsByBaseName(cols) {
    const groups = {};
    for (const col of cols) {
        const baseName = getColumnBaseName(col);
        const unit = getColumnUnit(col);
        const number = getColumnNumber(col);
        
        if (!groups[baseName]) {
            groups[baseName] = { columns: [], units: [] };
        }
        
        if (number === 1) {
            groups[baseName].columns.push(col);
            if (unit && !groups[baseName].units.includes(unit)) {
                groups[baseName].units.push(unit);
            }
        }
    }
    return groups;
}

function renderEditTableNav() {
    const nav = document.getElementById('editTableNav');
    if (!nav || !tables) return;

    nav.innerHTML = tables.map(t => `
        <button class="btn me-2 mb-2 ${t.table_id === 1 ? 'btn-primary' : 'btn-outline-primary'}" 
                onclick="switchEditTable(${t.table_id})">
            表格${t.table_id}
        </button>
    `).join('');
}

function switchEditTable(table_id) {
    currentEditTableId = table_id;
    columnUnitSelections = {};
    llmGeneratedData = null;

    const buttons = document.querySelectorAll('#editTableNav button');
    buttons.forEach(btn => {
        btn.classList.remove('btn-primary');
        btn.classList.add('btn-outline-primary');
        if (parseInt(btn.textContent.match(/\d+/)[0]) === table_id) {
            btn.classList.remove('btn-outline-primary');
            btn.classList.add('btn-primary');
        }
    });

    updateLLMTableContext();
    detectUnmapped();
    initEditTable();
}

function updateLLMTableContext() {
    const table = tables.find(t => t.table_id === currentEditTableId);
    if (!table) return;
    
    const tableInfo = document.getElementById('llmTableContext');
    if (tableInfo) {
        tableInfo.innerHTML = `
            <div class="alert alert-info small">
                <strong>当前表格:</strong> 表格${currentEditTableId} | 
                <strong>有效行数:</strong> ${table.data_rows.length}
            </div>
        `;
    }
}

async function detectUnmapped() {
    if (!fid) {
        alert('请先上传PDF');
        return;
    }

    // 使用当前选择的表格而不是编辑表格
    const tableIdToUse = typeof currentTableId !== 'undefined' ? currentTableId : currentEditTableId;

    try {
        const res = await fetch('/edit/unmapped', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                fid: fid,
                table_id: tableIdToUse
            })
        });
        const data = await res.json();
        if (data.status === 'success') {
            unmappedColumns = data.unmapped;
            renderUnmappedCols();
        }
    } catch (e) {
        console.error('检测未映射列失败', e);
    }
}

// 跟踪展开/折叠状态
let expandedGroups = {};

function groupColumnsByFirstWord(cols) {
    const groups = {};
    cols.forEach(col => {
        // 获取第一个单词（按空格或驼峰分割）
        let firstWord = col.split(/\s|(?=[A-Z])/)[0];
        if (!groups[firstWord]) {
            groups[firstWord] = [];
        }
        groups[firstWord].push(col);
    });
    return groups;
}

function toggleGroup(groupName) {
    expandedGroups[groupName] = !expandedGroups[groupName];
    renderUnmappedCols();
}

function renderUnmappedCols() {
    const container = document.getElementById('unmappedCols');
    if (!container) return;

    if (!unmappedColumns || unmappedColumns.length === 0) {
        container.innerHTML = '<span class="text-success fw-bold">✅ 所有列已完成映射！</span>';
        return;
    }

    const groups = groupColumnsByFirstWord(unmappedColumns);
    let html = '';

    Object.keys(groups).sort().forEach(groupName => {
        const cols = groups[groupName];
        const isExpanded = expandedGroups[groupName];
        
        html += `
            <div class="mb-2">
                <button class="btn btn-sm btn-warning w-100 text-start" onclick="toggleGroup('${escapeHtmlAttr(groupName)}')">
                    <span class="fw-bold">${groupName}</span>
                    <span class="badge bg-dark ms-2">${cols.length}</span>
                    <span class="float-end">${isExpanded ? '▼' : '▶'}</span>
                </button>
                ${isExpanded ? `
                    <div class="mt-2 ms-2 d-flex flex-wrap gap-2">
                        ${cols.map(col => `
                            <span class="badge bg-warning-subtle text-warning-emphasis border border-warning" 
                                  style="cursor: pointer;"
                                  onclick="selectUnmappedCol('${escapeHtmlAttr(col)}')">
                                ${col}
                            </span>
                        `).join('')}
                    </div>
                ` : ''}
            </div>
        `;
    });

    container.innerHTML = html;
}

// 点击未映射列时，将其设为补充列
function selectUnmappedCol(colName) {
    const selectEl = document.getElementById('supplementColumnSelect');
    if (selectEl) {
        selectEl.value = colName;
        // 滚动到补充列输入框
        const valueInput = document.getElementById('supplementValueInput');
        if (valueInput) {
            valueInput.focus();
        }
    }
}

function initEditTable() {
    const preview = document.getElementById('editTablePreview');
    if (!preview) return;

    const table = tables.find(t => t.table_id === currentEditTableId);
    if (!table) {
        preview.innerHTML = '<div class="text-center text-muted">表格不存在</div>';
        return;
    }

    // 确定使用哪个版本的数据
    if (table.use_original) {
        editTableData = [];
        if (table.original_data_rows && table.original_data_rows.length > 0) {
            const headers = table.original_headers || table.headers;
            editTableData = table.original_data_rows.map(r => {
                const rowDict = {};
                headers.forEach((h, i) => {
                    rowDict[h] = r[i] || '';
                });
                return rowDict;
            });
        } else {
            editTableData = table.data_rows;
        }
    } else {
        editTableData = table.data_rows;
    }
    renderEditTable();
}

function onUnitChange(baseName, unit) {
    columnUnitSelections[baseName] = unit;
    renderEditTable();
}

function isColumnMapped(colName) {
    const table = tables.find(t => t.table_id === currentEditTableId);
    if (!table) return false;
    
    const autoMap = table.auto_map || {};
    const manualMap = table.manual_map || {};
    const allMappedCols = [...Object.values(autoMap), ...Object.values(manualMap)];
    
    return allMappedCols.includes(colName);
}

function getEntryValue(row, headers) {
    for (const h of headers) {
        if (h.toLowerCase().includes("entry")) {
            return row[h] || "";
        }
    }
    return "";
}

function renderEditTable() {
    const preview = document.getElementById('editTablePreview');
    if (!preview) return;

    const table = tables.find(t => t.table_id === currentEditTableId);
    if (!table) {
        preview.innerHTML = '<div class="text-center text-muted">表格不存在</div>';
        return;
    }

    // 确定使用哪个版本的表头
    let displayHeaders;
    if (table.use_original) {
        displayHeaders = table.original_headers || table.headers;
    } else {
        displayHeaders = table.headers;
    }

    const templateCols = table.template_cols ? table.template_cols : template_cols;
    if (!templateCols) return;

    const autoMap = table.auto_map || {};
    const manualMap = table.manual_map || {};
    const finalMap = {...autoMap, ...manualMap};
    const manualSupplements = table.manual_supplements || [];

    const firstFourCols = templateCols.slice(0, 4);
    const remainingCols = templateCols.slice(4);
    
    const supplementCols = manualSupplements.map(s => s.column);
    const allRemainingCols = [...remainingCols, ...supplementCols];
    const colGroups = groupColumnsByBaseName(allRemainingCols);

    let theadHtml = '<tr>';
    for (let i = 0; i < firstFourCols.length; i++) {
        const col = firstFourCols[i];
        const stickyStyle = i === 0 ? 'position: sticky; left: 0; background: white; z-index: 10;' : '';
        theadHtml += `<th class="text-nowrap" style="${stickyStyle}">${col}</th>`;
    }

    for (const [baseName, group] of Object.entries(colGroups)) {
        const hasMultipleUnits = group.units.length > 1;
        const isUnmapped = group.columns.some(c => unmappedColumns.includes(c));
        const defaultUnit = columnUnitSelections[baseName] || group.units[0] || '';
        
        theadHtml += `<th class="text-nowrap ${isUnmapped ? 'bg-warning-subtle' : ''}">
            <div class="d-flex flex-column align-items-center">
                <span>${baseName}</span>
                ${hasMultipleUnits ? `
                    <select class="form-select form-select-xs mt-1" style="width: 80px;"
                            onchange="onUnitChange('${escapeHtmlAttr(baseName)}', this.value)">
                        ${group.units.map(u => `<option value="${u}" ${defaultUnit === u ? 'selected' : ''}>${u}</option>`).join('')}
                    </select>
                ` : (defaultUnit ? `<span class="badge bg-secondary text-white text-xs mt-1">${defaultUnit}</span>` : '')}
            </div>
        </th>`;
    }
    theadHtml += '</tr>';

    let tbodyHtml = '';
    for (let idx = 0; idx < editTableData.length; idx++) {
        tbodyHtml += '<tr>';

        for (let i = 0; i < firstFourCols.length; i++) {
            const col = firstFourCols[i];
            let value = '';
            
            if (col === 'Reaction ID') {
                const entryVal = getEntryValue(editTableData[idx], displayHeaders);
                if (entryVal) {
                    value = `T${currentEditTableId}_${entryVal}`;
                } else {
                    value = `T${currentEditTableId}_${idx + 1}`;
                }
            } else if (col === 'Reaction DOI') {
                value = data.doi || '';
            } else if (col === 'Reaction Year') {
                value = data.year || '';
            } else if (col === 'Reaction Type') {
                value = '';
            }

            const stickyStyle = i === 0 ? 'position: sticky; left: 0; background: white; z-index: 9;' : '';
            tbodyHtml += `<td style="${stickyStyle}">
                ${col === 'Reaction Type' ? `<input type="text" class="form-control form-control-sm" data-row="${idx}" data-col="${col}" value="${escapeHtmlAttr(value)}">` : escapeHtml(value)}
            </td>`;
        }

        for (const [baseName, group] of Object.entries(colGroups)) {
            let currentValue = '';
            const selectedUnit = columnUnitSelections[baseName] || group.units[0];
            
            let targetCol = null;
            if (selectedUnit) {
                targetCol = group.columns.find(c => c.includes(`(${selectedUnit})`));
            }
            if (!targetCol && group.columns.length > 0) {
                targetCol = group.columns[0];
            }

            if (targetCol) {
                // 首先检查是否有手动补充列
                const supplement = manualSupplements.find(s => s.column === targetCol);
                if (supplement) {
                    currentValue = supplement.value;
                } else {
                    for (const [tableCol, templateCol] of Object.entries(finalMap)) {
                        if (templateCol === targetCol && tableCol in editTableData[idx]) {
                            currentValue = editTableData[idx][tableCol];
                            break;
                        }
                    }

                    if (data.edited_data && data.edited_data[`table_${currentEditTableId}`]) {
                        const editedRow = data.edited_data[`table_${currentEditTableId}`][idx];
                        if (editedRow && editedRow[targetCol]) {
                            currentValue = editedRow[targetCol];
                        }
                    }
                }
            }

            const isUnmapped = group.columns.some(c => unmappedColumns.includes(c));
            const hasSupplement = targetCol && manualSupplements.some(s => s.column === targetCol);
            tbodyHtml += `<td class="${isUnmapped ? 'bg-warning-subtle' : (hasSupplement ? 'bg-info-subtle' : '')}">
                <input type="text" class="form-control form-control-sm w-full" 
                       data-row="${idx}" data-base="${escapeHtmlAttr(baseName)}" 
                       value="${escapeHtmlAttr(currentValue)}">
            </td>`;
        }

        tbodyHtml += '</tr>';
    }

    preview.innerHTML = `
        <div style="max-height: 450px; overflow-x: auto;">
            <table class="table table-sm table-bordered w-100">
                <thead class="table-light sticky-top">${theadHtml}</thead>
                <tbody>${tbodyHtml}</tbody>
            </table>
        </div>
    `;
}

async function saveEditedTable() {
    if (!fid) {
        alert('请先上传PDF');
        return;
    }

    const templateCols = template_cols;
    const rows = [];
    const table = tables.find(t => t.table_id === currentEditTableId);
    const manualSupplements = table ? table.manual_supplements || [] : [];

    const firstFourCols = templateCols.slice(0, 4);
    const remainingCols = templateCols.slice(4);
    const colGroups = groupColumnsByBaseName(remainingCols);

    const rowCount = editTableData.length;
    for (let i = 0; i < rowCount; i++) {
        const row = {};
        
        for (let j = 0; j < firstFourCols.length; j++) {
            const col = firstFourCols[j];
            if (col === 'Reaction ID') {
                const entryVal = getEntryValue(editTableData[i], table.headers);
                if (entryVal) {
                    row[col] = `T${currentEditTableId}_${entryVal}`;
                } else {
                    row[col] = `T${currentEditTableId}_${i + 1}`;
                }
            } else if (col === 'Reaction DOI') {
                row[col] = data.doi || '';
            } else if (col === 'Reaction Year') {
                row[col] = data.year || '';
            } else {
                const input = document.querySelector(`input[data-row="${i}"][data-col="${col}"]`);
                row[col] = input ? input.value : '';
            }
        }

        for (const [baseName, group] of Object.entries(colGroups)) {
            const input = document.querySelector(`input[data-row="${i}"][data-base="${baseName}"]`);
            const value = input ? input.value : '';
            const selectedUnit = columnUnitSelections[baseName] || group.units[0];
            
            let targetCol = null;
            if (selectedUnit) {
                targetCol = templateCols.find(c => c.includes(baseName) && c.includes(`(${selectedUnit})`));
            }
            if (!targetCol) {
                targetCol = group.columns[0];
            }
            
            if (targetCol) {
                // 检查是否有手动补充列
                const supplement = manualSupplements.find(s => s.column === targetCol);
                row[targetCol] = supplement ? supplement.value : value;
            }
        }

        rows.push(row);
    }

    try {
        const res = await fetch('/edit/save', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                fid: fid,
                table_id: currentEditTableId,
                rows: rows
            })
        });
        const result = await res.json();
        if (result.status === 'success') {
            alert('保存成功');
            refreshCSVPreview();
        }
    } catch (e) {
        alert('保存失败: ' + e.message);
    }
}

async function applyLLMToTable() {
    const img = document.getElementById('llmImageSelect').value;
    const note = document.getElementById('llmNoteInput').value;
    const custom = document.getElementById('llmCustomPrompt').value;

    if (!img && !note) {
        alert('请先选择图片或表注作为LLM输入');
        return;
    }

    const btn = event.target;
    btn.disabled = true;
    btn.innerHTML = '⏳ LLM分析中...';

    const table = tables.find(t => t.table_id === currentEditTableId);
    const rowCount = table ? table.data_rows.length : 0;

    const defaultPrompt = `分析图片和表注中的化学反应信息。
请找出反应条件（如温度、时间、压力等）和对应的数值。
以表格形式返回数据：
- 第一行是条件名称（包括单位）
- 第二行是对应的数值
- 每个条件单独一列
- 不需要JSON格式

当前表格有${rowCount}行有效数据，每个条件对应的数值需要在所有${rowCount}行中保持一致。

示例格式：
时间 (h) | 温度 (°C)
24      | 25`;

    try {
        const res = await fetch('/llm/analyse', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                fid: fid,
                img: img,
                note: note,
                custom_prompt: defaultPrompt + (custom ? `\n额外要求：${custom}` : '')
            })
        });
        const data = await res.json();

        if (data.result) {
            llmGeneratedData = data.result;
            renderLLMResult(llmGeneratedData, rowCount);
        }
    } catch (e) {
        alert('LLM分析失败: ' + e.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = 'LLM自动填充';
    }
}

function renderLLMResult(result, rowCount) {
    const outputEl = document.getElementById('llmOutput');
    if (!outputEl) return;

    let tableHtml = `
        <div class="mb-3">
            <div class="d-flex justify-content-between align-items-center mb-2">
                <h6>🧠 LLM分析结果</h6>
                <button class="btn btn-sm btn-primary" onclick="applyLLMData(${rowCount})">
                    📋 应用到表格
                </button>
            </div>
            <div class="overflow-auto">
                <table class="table table-sm table-bordered">
                    <tbody>`;
    
    const lines = result.split('\n').filter(line => line.trim());
    for (const line of lines) {
        if (!line.trim()) continue;
        
        const cells = line.split(/\t|\|/).map(c => c.trim()).filter(c => c);
        tableHtml += '<tr>';
        for (const cell of cells) {
            tableHtml += `<td>${escapeHtml(cell)}</td>`;
        }
        tableHtml += '</tr>';
    }
    
    tableHtml += `</tbody></table></div></div>`;
    outputEl.innerHTML = tableHtml;
}

function applyLLMData(rowCount) {
    if (!llmGeneratedData) {
        alert('请先运行LLM分析');
        return;
    }
    
    const lines = llmGeneratedData.split('\n').filter(line => line.trim());
    if (lines.length < 2) {
        alert('LLM结果格式不正确，请重新分析');
        return;
    }
    
    const headers = lines[0].split(/\t|\|/).map(c => c.trim()).filter(c => c);
    const values = lines[1].split(/\t|\|/).map(c => c.trim()).filter(c => c);
    
    if (headers.length !== values.length) {
        alert('表头和数值数量不匹配');
        return;
    }
    
    const templateCols = template_cols;
    const remainingCols = templateCols.slice(4);
    const colGroups = groupColumnsByBaseName(remainingCols);
    
    for (let colIdx = 0; colIdx < headers.length; colIdx++) {
        const header = headers[colIdx];
        const value = values[colIdx];
        
        let matchedBaseName = null;
        for (const baseName of Object.keys(colGroups)) {
            const baseLower = baseName.toLowerCase();
            const headerLower = header.toLowerCase();
            
            if (baseLower.includes(headerLower) || headerLower.includes(baseLower)) {
                matchedBaseName = baseName;
                break;
            }
        }
        
        if (!matchedBaseName) {
            console.log('未找到映射列: ' + header);
            continue;
        }
        
        for (let rowIdx = 0; rowIdx < rowCount; rowIdx++) {
            const inputs = document.querySelectorAll(`input[data-row="${rowIdx}"][data-base="${matchedBaseName}"]`);
            for (const input of inputs) {
                input.value = value;
            }
        }
    }
    
    alert('LLM数据已应用到表格');
}

function refreshCSVPreview() {
    if (!fid) {
        alert('请先上传PDF');
        return;
    }
    renderFinalCSVPreview();
}

function renderFinalCSVPreview() {
    const preview = document.getElementById('finalCSVPreview');
    if (!preview) return;

    const templateCols = template_cols;
    let html = '<table class="table table-sm table-bordered w-100"><thead class="table-light"><tr>';

    for (let i = 0; i < templateCols.length; i++) {
        html += `<th class="text-nowrap">${templateCols[i]}</th>`;
    }
    html += '</tr></thead><tbody>';

    for (let tId = 1; tId <= tables.length; tId++) {
        const table = tables.find(t => t.table_id === tId);
        if (!table) continue;

        // 确定使用哪个版本的表头和数据
        let displayHeaders;
        let rowData;

        const editedKey = `table_${tId}`;
        const hasEdited = data.edited_data && data.edited_data[editedKey];

        if (table.use_original) {
            displayHeaders = table.original_headers || table.headers;
            if (hasEdited) {
                rowData = data.edited_data[editedKey];
            } else if (table.original_data_rows && table.original_data_rows.length > 0) {
                rowData = table.original_data_rows.map(r => {
                    const rowDict = {};
                    displayHeaders.forEach((h, i) => {
                        rowDict[h] = r[i] || '';
                    });
                    return rowDict;
                });
            } else {
                rowData = table.data_rows;
            }
        } else {
            displayHeaders = table.headers;
            rowData = hasEdited ? data.edited_data[editedKey] : table.data_rows;
        }

        const manualSupplements = table.manual_supplements || [];

        const autoMap = table.auto_map || {};
        const manualMap = table.manual_map || {};
        const finalMap = {...autoMap, ...manualMap};

        for (let idx = 0; idx < rowData.length; idx++) {
            html += '<tr>';

            for (let i = 0; i < 4; i++) {
                const col = templateCols[i];
                let value = '';
                if (col === 'Reaction ID') {
                    if (hasEdited) {
                        value = rowData[idx]?.[col] || '';
                    } else {
                        value = getEntryValue(rowData[idx], displayHeaders);
                        if (!value) {
                            value = `T${tId}_${idx + 1}`;
                        }
                    }
                } else if (col === 'Reaction DOI') {
                    value = data.doi || '';
                } else if (col === 'Reaction Year') {
                    value = data.year || '';
                }
                html += `<td>${escapeHtml(value)}</td>`;
            }

            for (let i = 4; i < templateCols.length; i++) {
                const col = templateCols[i];
                let value = '';

                // 首先检查是否有手动补充列
                const supplement = manualSupplements.find(s => s.column === col);
                if (supplement) {
                    value = supplement.value;
                } else if (hasEdited) {
                    value = rowData[idx]?.[col] || '';
                } else {
                    for (const [tableCol, templateCol] of Object.entries(finalMap)) {
                        if (templateCol === col && tableCol in rowData[idx]) {
                            value = rowData[idx][tableCol];
                        }
                    }
                }

                html += `<td>${escapeHtml(value)}</td>`;
            }

            html += '</tr>';
        }
    }

    html += '</tbody></table>';
    preview.innerHTML = html;
}

function exportFinalCSV() {
    if (!fid) {
        alert('请先上传PDF');
        return;
    }

    const form = document.createElement('form');
    form.method = 'POST';
    form.action = '/edit/generate';
    form.innerHTML = `<input type="hidden" name="fid" value="${fid}">`;
    document.body.appendChild(form);
    form.submit();
    document.body.removeChild(form);
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function escapeHtmlAttr(text) {
    if (!text) return '';
    return escapeHtml(text).replace(/"/g, '&quot;');
}
