let currentTableView = 'original';
let confirmedTableView = null;
let confirmedTableId = null;

function toggleTableView(view) {
    currentTableView = view;
    document.getElementById('splitBtn').classList.remove('btn-primary');
    document.getElementById('splitBtn').classList.add('btn-outline-secondary');
    document.getElementById('originalBtn').classList.remove('btn-primary');
    document.getElementById('originalBtn').classList.add('btn-outline-secondary');
    if (view === 'fixed') {
        document.getElementById('splitBtn').classList.add('btn-primary');
        document.getElementById('splitBtn').classList.remove('btn-outline-secondary');
    } else {
        document.getElementById('originalBtn').classList.add('btn-primary');
        document.getElementById('originalBtn').classList.remove('btn-outline-secondary');
    }
    switchTable(currentTableId);
}

function confirmTableVersion() {
    confirmedTableView = currentTableView;
    confirmedTableId = currentTableId;
    const t = tables.find(x => x.table_id === confirmedTableId);
    if (!t) return;

    // 更新表格数据为选中的版本
    if (confirmedTableView === 'fixed') {
        t.use_original = false;
    } else {
        t.use_original = true;
    }

    // 渲染列映射配置和手动补充列
    renderDualColumnMap(t);
    renderManualSupplement(t);

    // 启用保存按钮
    const saveMapBtn = document.getElementById('saveMapBtn');
    if (saveMapBtn) {
        saveMapBtn.disabled = false;
    }

    alert('已确认使用 ' + (confirmedTableView === 'fixed' ? '修正后' : '原始') + ' 版本');
}

function renderTableNav() {
    const nav = document.getElementById('tableNav');
    if (!nav || !tables) return;

    nav.innerHTML = tables.map(t => `
        <button class="btn me-2 mb-2 ${t.table_id===1?'btn-secondary':'btn-outline-secondary'}" onclick="switchTable(${t.table_id})">
            表格${t.table_id}
        </button>
    `).join('');
}

function switchTable(tid) {
    currentTableId = tid;
    const t = tables.find(x => x.table_id === tid);
    if (!t) return;

    const captionHtml = t.caption ? `<h6 class="mb-2">${t.caption}</h6>` : '';
    const noteHtml = t.note ? `<p class="text-muted small mb-2">${t.note}</p>` : '';
    
    const delCount = t.deleted_row_count || 0;
    const delHtml = delCount > 0 ? `
        <div class="alert alert-warning alert-dismissible fade show small mb-2" role="alert">
            <strong>⚠️ 删除畸形行:</strong> ${delCount} 行
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        </div>
    ` : '';

    // 渲染原始表格（支持修正后/原始切换）
    const tablePreviewEl = document.getElementById('tablePreview');
    if (tablePreviewEl) {
        let displayHeaders, displayRows;
        let viewLabel = currentTableView === 'fixed' ? '修正后' : '原始';

        if (currentTableView === 'fixed') {
            displayHeaders = t.headers;
            displayRows = t.data_rows;
        } else {
            displayHeaders = t.original_headers || t.headers;
            displayRows = t.original_data_rows && t.original_data_rows.length > 0
                ? t.original_data_rows.map(r => {
                    const rowDict = {};
                    (t.original_headers || t.headers).forEach((h, i) => {
                        rowDict[h] = r[i] || '';
                    });
                    return rowDict;
                })
                : t.data_rows;
        }

        const originalHtml = `
            ${captionHtml}
            ${delHtml}
            ${noteHtml}
            <table class="table table-sm table-bordered">
                <thead><tr>${displayHeaders.map(h => `<th>${h}</th>`).join('')}</tr></thead>
                <tbody>${displayRows.map(r => `<tr>${displayHeaders.map(h => `<td>${r[h]||''}</td>`).join('')}</tr>`).join('')}</tbody>
            </table>
        `;
        tablePreviewEl.innerHTML = originalHtml;
        if (typeof renderMathContent === 'function') {
            renderMathContent(tablePreviewEl);
        }
    }

    // 渲染补充表格
    renderSupplementTable(t);

    // 只有确认了版本才显示列映射配置，否则显示提示
    const mapConfigEl = document.getElementById('mapConfig');
    const manualSupplementEl = document.getElementById('manualSupplementConfig');
    if (confirmedTableId === currentTableId) {
        // 渲染双栏映射配置
        renderDualColumnMap(t);
        // 渲染手动补充列
        renderManualSupplement(t);
        // 启用保存按钮
        document.getElementById('saveMapBtn').disabled = false;
    } else {
        mapConfigEl.innerHTML = '<div class="text-center text-muted py-4">请选择表格版本后点击"确定"按钮进行列映射配置</div>';
        manualSupplementEl.innerHTML = '<div class="text-center text-muted py-4">请选择表格版本后点击"确定"按钮</div>';
        // 禁用保存按钮
        document.getElementById('saveMapBtn').disabled = true;
    }

    // 清空未映射列区域
    const unmappedContainer = document.getElementById('unmappedCols');
    if (unmappedContainer) {
        unmappedContainer.innerHTML = '<div class="text-muted text-center">点击"检测未映射列"查看</div>';
    }
    // 重置展开状态
    if (typeof expandedGroups !== 'undefined') {
        expandedGroups = {};
    }
    if (typeof unmappedColumns !== 'undefined') {
        unmappedColumns = [];
    }
}

function renderSupplementTable(t) {
    const supplementPreviewEl = document.getElementById('supplementTablePreview');
    if (!supplementPreviewEl) return;

    if (!t.supplement_headers || t.supplement_headers.length === 0) {
        supplementPreviewEl.innerHTML = '<div class="text-center text-muted">暂无补充表格，点击生成按钮创建</div>';
        return;
    }

    const html = `
        <table class="table table-sm table-bordered">
            <thead><tr>${t.supplement_headers.map(h=>`<th>${h}</th>`).join('')}</tr></thead>
            <tbody>${t.supplement_data_rows.map(r=>`<tr>${t.supplement_headers.map(h=>`<td>${r[h]||''}</td>`).join('')}</tr>`).join('')}</tbody>
        </table>
    `;
    supplementPreviewEl.innerHTML = html;
    if (typeof renderMathContent === 'function') {
        renderMathContent(supplementPreviewEl);
    }
}

function renderDualColumnMap(t) {
    const mapConfigEl = document.getElementById('mapConfig');
    if (!mapConfigEl) return;

    // 确定使用哪个版本的表头
    let displayHeaders;
    if (t.use_original) {
        displayHeaders = t.original_headers || t.headers;
    } else {
        displayHeaders = t.headers;
    }

    // 原表的自动映射和手动映射
    const auto_map = t.auto_map || {};
    const manual_map = t.manual_map || {};
    
    // 补充表的自动映射和手动映射
    const supp_auto_map = t.supplement_auto_map || {};
    const supp_manual_map = t.supplement_manual_map || {};

    let html = `
        <form id="mapForm">
            <input type="hidden" name="fid" value="${fid}">
            <input type="hidden" name="tid" value="${t.table_id}">
            
            <div class="row mb-3">
    `;

    // 原始表格列映射
    displayHeaders.forEach(h => {
        const current_map = manual_map[h] || auto_map[h] || '';
        html += `
            <div class="col-md-6 mb-2">
                <label class="form-label small fw-bold">${h}</label>
                <select name="map_${h}" class="form-select form-select-sm">
                    <option value="">--不映射--</option>
                    ${template_cols.map(c => `
                        <option value="${c}" ${current_map === c ? 'selected' : ''}>${c}</option>
                    `).join('')}
                </select>
            </div>
        `;
    });

    // 补充表格列映射（与原始表格列一起显示）
    if (t.supplement_headers && t.supplement_headers.length > 0) {
        t.supplement_headers.forEach(h => {
            const current_map = supp_manual_map[h] || supp_auto_map[h] || '';
            html += `
                <div class="col-md-6 mb-2">
                    <label class="form-label small fw-bold text-success">${h} <small>(补充)</small></label>
                    <select name="supp_map_${h}" class="form-select form-select-sm">
                        <option value="">--不映射--</option>
                        ${template_cols.map(c => `
                            <option value="${c}" ${current_map === c ? 'selected' : ''}>${c}</option>
                        `).join('')}
                    </select>
                </div>
            `;
        });
    }

    html += `</div>`;
    html += `</form>`;
    mapConfigEl.innerHTML = html;
    if (typeof renderMathContent === 'function') {
        renderMathContent(mapConfigEl);
    }
}

async function saveCurrentMap() {
    const form = document.getElementById('mapForm');
    if (!form) return alert('表单未加载');

    try {
        // 从表单中读取补充表格的手动映射
        const formData = new FormData(form);
        const supplement_manual_map = {};
        for (let [key, val] of formData.entries()) {
            if (key.startsWith('supp_map_') && val) {
                const col = key.replace('supp_map_', '');
                supplement_manual_map[col] = val;
            }
        }
        
        // 更新前端数据
        const t = tables.find(x => x.table_id === currentTableId);
        if (t) {
            t.supplement_manual_map = supplement_manual_map;
        }
        
        // 保存列映射（包括原始表格和补充表格的映射）
        const response = await fetch('/table/save_map', {
            method: 'POST',
            body: new FormData(form)
        });
        const result = await response.json();
        
        if (result.status !== 'success') {
            alert('映射保存失败：' + result.msg);
            return;
        }
        
        // 保存补充表格数据
        if (t) {
            const supplementsResponse = await fetch('/table/save_supplements', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    fid: fid,
                    tid: currentTableId,
                    supplements: t.manual_supplements || [],
                    supplement_data_rows: t.supplement_data_rows || [],
                    supplement_headers: t.supplement_headers || [],
                    supplement_auto_map: t.supplement_auto_map || {},
                    supplement_manual_map: t.supplement_manual_map || {}
                })
            });
            const supplementsResult = await supplementsResponse.json();
            
            if (supplementsResult.status !== 'success') {
                alert('补充列保存失败：' + supplementsResult.msg);
                return;
            }
        }
        
        alert('保存成功');
        
        // 刷新表格预览
        if (typeof refreshPreview === 'function') {
            refreshPreview();
        }
        if (typeof refreshEditTable === 'function') {
            refreshEditTable();
        }
    } catch (err) {
        alert('保存失败');
        console.error(err);
    }
}

// 将补充表格数据保存到表格中（不在预览中显示，仅导出时使用）
function mergeSupplementData(tableIndex) {
    const table = tables[tableIndex];
    if (!table || !table.supplement_data_rows || !table.supplement_headers) {
        return;
    }
    
    // 确保补充表格的映射对象存在
    if (!table.supplement_auto_map) {
        table.supplement_auto_map = {};
    }
    if (!table.supplement_manual_map) {
        table.supplement_manual_map = {};
    }
    
    // 注意：supplement_auto_map 已经在后端设置好，不要在前端覆盖
    // 这里只需要确保数据结构完整即可
}

// 模态框相关函数
let generateSupplementModal = null;

function openGenerateSupplementModal() {
    if (!generateSupplementModal) {
        generateSupplementModal = new bootstrap.Modal(document.getElementById('generateSupplementModal'));
    }
    
    // 自动填充当前表格的表注
    const t = tables.find(x => x.table_id === currentTableId);
    if (t && t.note && t.note !== '无表注') {
        document.getElementById('supplementNoteInput').value = t.note;
    }
    
    generateSupplementModal.show();
}

function generateSupplementTable() {
    const noteText = document.getElementById('supplementNoteInput').value.trim();
    const customPrompt = document.getElementById('supplementCustomPrompt').value.trim();
    
    if (!noteText) {
        alert('请输入文本/表注内容');
        return;
    }
    
    const t = tables.find(x => x.table_id === currentTableId);
    if (!t) return;
    
    const rowCount = t.data_rows ? t.data_rows.length : 0;
    
    const btn = document.getElementById('generateSupplementBtn');
    btn.disabled = true;
    btn.textContent = '⏳ 生成中...';
    
    fetch('/llm/generate_supplement_table', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
            fid: fid,
            tid: currentTableId,
            note_text: noteText,
            custom_prompt: customPrompt,
            row_count: rowCount
        })
    })
    .then(response => response.json())
    .then(async data => {
        if (data.status === 'success') {
            // 更新本地表格数据
            const tableIndex = tables.findIndex(x => x.table_id === currentTableId);
            if (tableIndex !== -1) {
                tables[tableIndex].supplement_headers = data.supplement_headers;
                tables[tableIndex].supplement_data_rows = data.supplement_data;
                tables[tableIndex].supplement_auto_map = data.supplement_auto_map || {};
                tables[tableIndex].supplement_manual_map = {};
                
                // 将补充表格数据合并到主表格中
                mergeSupplementData(tableIndex);
                
                // 保存到后端
                const t = tables[tableIndex];
                await fetch('/table/save_supplements', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({
                        fid: fid,
                        tid: currentTableId,
                        supplements: t.manual_supplements || [],
                        supplement_data_rows: t.supplement_data_rows || [],
                        supplement_headers: t.supplement_headers || [],
                        supplement_auto_map: t.supplement_auto_map || {},
                        supplement_manual_map: t.supplement_manual_map || {}
                    })
                });
                
                // 重新渲染
                switchTable(currentTableId);
            }
            
            alert('补充表格生成成功！');
            generateSupplementModal.hide();
        } else {
            alert('生成失败：' + data.msg);
        }
    })
    .catch(err => {
        alert('请求失败：' + err.message);
        console.error(err);
    })
    .finally(() => {
        btn.disabled = false;
        btn.textContent = '生成补充表格';
    });
}

// 手动补充列相关函数
function renderManualSupplement(t) {
    const supplementConfigEl = document.getElementById('manualSupplementConfig');
    if (!supplementConfigEl) return;

    const manualSupplements = t.manual_supplements || [];
    const rowCount = t.data_rows ? t.data_rows.length : 0;

    let html = `
        <div class="mb-3">
            <div class="row">
                <div class="col-md-12 mb-2">
                    <label class="form-label fw-bold small">🔍 选择列并输入填充值</label>
                    <input type="text" id="supplementColumnSearch" class="form-control form-control-sm mb-2" placeholder="输入关键词搜索列名..." oninput="filterTemplateColumns(this.value, ${t.table_id})">
                </div>
                <div class="col-md-12 mb-2">
                    <select id="supplementColumnSelect" class="form-select form-select-sm mb-2">
                        <option value="">-- 选择模板列 --</option>
                        ${template_cols.map(c => `<option value="${c}">${c}</option>`).join('')}
                    </select>
                </div>
                <div class="col-md-12 mb-2">
                    <div class="input-group">
                        <input type="text" id="supplementValueInput" class="form-control form-control-sm" placeholder="输入填充值">
                        <button class="btn btn-primary btn-sm" onclick="addManualSupplement(${t.table_id})">
                            ➕ 添加
                        </button>
                    </div>
                </div>
            </div>
        </div>
        <hr>
        <h6 class="fw-bold mb-2">已添加的补充列</h6>
        <div id="supplementList">
    `;

    if (manualSupplements.length === 0) {
        html += `<div class="text-muted small">暂无补充列</div>`;
    } else {
        manualSupplements.forEach((supp, idx) => {
            html += `
                <div class="card mb-2 border-secondary">
                    <div class="card-body p-2">
                        <div class="d-flex align-items-center gap-2">
                            <input type="text" class="form-control form-control-sm flex-shrink-0" 
                                   style="width: 200px; flex-grow: 0;"
                                   value="${escapeHtmlAttr(supp.value)}"
                                   onchange="updateSupplementValue(${t.table_id}, ${idx}, this.value)"
                                   placeholder="值">
                            <span class="fw-bold small text-truncate flex-grow-1 text-right" style="min-width: 0; text-align: right;" title="${escapeHtmlAttr(supp.column)}">${escapeHtml(supp.column)}</span>
                            <button class="btn btn-sm btn-outline-danger flex-shrink-0" onclick="removeManualSupplement(${t.table_id}, ${idx})">
                                ✕
                            </button>
                        </div>
                    </div>
                </div>
            `;
        });
    }

    html += `
        </div>
        <div class="mt-2 text-muted small">
            <strong>💡 提示：</strong> 补充列将应用于该表格的所有 ${rowCount} 行数据
        </div>
    `;

    supplementConfigEl.innerHTML = html;
}

// 更新补充列的值
function updateSupplementValue(tableId, idx, newValue) {
    const t = tables.find(x => x.table_id === tableId);
    if (t && t.manual_supplements && t.manual_supplements[idx]) {
        t.manual_supplements[idx].value = newValue;
    }
}

function filterTemplateColumns(keyword, tableId) {
    const select = document.getElementById('supplementColumnSelect');
    if (!select) return;

    select.innerHTML = `<option value="">-- 选择模板列 --</option>` + 
        template_cols
            .filter(c => c.toLowerCase().includes(keyword.toLowerCase()))
            .map(c => `<option value="${c}">${c}</option>`)
            .join('');
}

function addManualSupplement(tableId) {
    const columnSelect = document.getElementById('supplementColumnSelect');
    const valueInput = document.getElementById('supplementValueInput');
    
    const column = columnSelect.value;
    const value = valueInput.value.trim();

    if (!column) {
        alert('请选择要补充的列');
        return;
    }
    if (!value) {
        alert('请输入填充值');
        return;
    }

    const t = tables.find(x => x.table_id === tableId);
    if (!t) return;

    if (!t.manual_supplements) {
        t.manual_supplements = [];
    }

    // 检查是否已存在相同列
    const existingIndex = t.manual_supplements.findIndex(s => s.column === column);
    if (existingIndex !== -1) {
        t.manual_supplements[existingIndex].value = value;
    } else {
        t.manual_supplements.push({ column, value });
    }

    // 清空输入
    columnSelect.value = '';
    valueInput.value = '';

    // 重新渲染
    renderManualSupplement(t);
}

function removeManualSupplement(tableId, index) {
    const t = tables.find(x => x.table_id === tableId);
    if (!t || !t.manual_supplements) return;

    t.manual_supplements.splice(index, 1);
    renderManualSupplement(t);
}
