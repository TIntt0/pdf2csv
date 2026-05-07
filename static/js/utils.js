// 全局共享变量
let fid = null;
let tables = [];
let images = [];
let template_cols = [];
let currentTableId = 1;
let selectedImage = null;
let selectedToShow = [];
let tableMeta = [];  // 新增：存储表格标题/表注/修复状态

let startTime, timer;

// 公式渲染（上下标正常显示）
function renderMathContent(targetEl) {
    if (!targetEl) return;
    renderMathInElement(targetEl, {
        delimiters: [{left:"$",right:"$",display:false}],
        throwOnError: false, strict: false
    });
}