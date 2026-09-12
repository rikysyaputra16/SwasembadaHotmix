"use strict";
(async function performanceEnhancement(){
  if(!document.querySelector('link[href="/performance-print.css"]')){const link=document.createElement("link");link.rel="stylesheet";link.href="/performance-print.css";document.head.appendChild(link)}
  const api=async(url)=>{const r=await fetch(url);const p=await r.json().catch(()=>({}));if(!r.ok)throw new Error(p.error||`HTTP ${r.status}`);return p};
  let permissionPayload=null;try{permissionPayload=await api("/api/permissions/current")}catch(error){console.error("permission_load_error",error)}
  if(permissionPayload?.permissions)window.HOTMIX_PERMISSIONS={...(window.HOTMIX_PERMISSIONS||{}),...permissionPayload.permissions};
  const can=key=>Boolean(window.HOTMIX_PERMISSIONS?.[key]);

  const exportBtn=document.getElementById("exportExcelBtn");
  if(exportBtn){exportBtn.classList.toggle("rbac-hidden",!can("export.excel"));exportBtn.addEventListener("click",event=>{if(can("export.excel"))return;event.preventDefault();event.stopImmediatePropagation();if(typeof toast==="function")toast("Role ini tidak memiliki akses Export Excel.",true)},true)}

  const dashboardPrint=[...document.querySelectorAll("#dashboard>.page-head .btn")].find(btn=>/Cetak Ringkasan/i.test(btn.textContent||""));
  if(dashboardPrint){dashboardPrint.removeAttribute("onclick");dashboardPrint.addEventListener("click",()=>{document.body.dataset.printTarget="dashboardSummary";try{window.print()}finally{delete document.body.dataset.printTarget}})}

  const configs=[
    {key:"history",selector:"#historyPayments",kind:"items"},
    {key:"matrix",selector:"#installmentMatrixRows",kind:"rows"},
    {key:"arrears",selector:"#arrearsRows",kind:"rows"},
    {key:"members",selector:"#memberRows",kind:"rows"},
    {key:"plans",selector:"#planRows",kind:"rows"},
    {key:"payments",selector:"#paymentRows",kind:"rows"}
  ];
  const pageState=new Map(configs.map(cfg=>[cfg.key,{size:10,page:1}]));

  function dataItems(container,kind){const all=[...container.children];if(all.length===1&&(all[0].classList.contains("empty")||all[0].querySelector?.(".empty")))return[];return kind==="rows"?all.filter(node=>node.tagName==="TR"):all.filter(node=>node.classList.contains("recent-item"))}
  function controlAnchor(container,kind){if(kind==="rows")return container.closest(".table-scroll")||container.parentElement;return container}
  function ensureControl(cfg){
    const container=document.querySelector(cfg.selector);if(!container)return null;
    let bar=document.querySelector(`[data-row-control="${cfg.key}"]`);if(bar)return bar;
    bar=document.createElement("div");bar.className="row-limit-bar screen-only";bar.dataset.rowControl=cfg.key;
    bar.innerHTML=`<div class="row-limit-left"><label>Rows <select data-row-size><option value="10" selected>10</option><option value="20">20</option><option value="50">50</option><option value="all">All</option></select></label><span class="row-limit-info" data-row-info></span></div><div class="row-limit-right"><button type="button" class="btn small" data-row-prev>‹ Sebelumnya</button><button type="button" class="btn small" data-row-next>Berikutnya ›</button></div>`;
    const anchor=controlAnchor(container,cfg.kind);anchor.parentElement.insertBefore(bar,anchor);
    bar.querySelector("[data-row-size]").addEventListener("change",event=>{const st=pageState.get(cfg.key);st.size=event.target.value==="all"?"all":Number(event.target.value);st.page=1;applyPagination(cfg)});
    bar.querySelector("[data-row-prev]").addEventListener("click",()=>{const st=pageState.get(cfg.key);st.page=Math.max(1,st.page-1);applyPagination(cfg)});
    bar.querySelector("[data-row-next]").addEventListener("click",()=>{const st=pageState.get(cfg.key);st.page+=1;applyPagination(cfg)});
    return bar;
  }
  function applyPagination(cfg){
    const container=document.querySelector(cfg.selector);if(!container)return;const bar=ensureControl(cfg);if(!bar)return;const st=pageState.get(cfg.key),items=dataItems(container,cfg.kind),total=items.length;
    if(st.size==="all"){st.page=1;items.forEach(item=>item.classList.remove("perf-row-hidden"));bar.querySelector("[data-row-info]").textContent=total?`1–${total} dari ${total}`:"0 data";bar.querySelector("[data-row-prev]").disabled=true;bar.querySelector("[data-row-next]").disabled=true;return}
    const pages=Math.max(1,Math.ceil(total/st.size));st.page=Math.min(Math.max(1,st.page),pages);const start=(st.page-1)*st.size,end=Math.min(total,start+st.size);
    items.forEach((item,index)=>item.classList.toggle("perf-row-hidden",index<start||index>=end));bar.querySelector("[data-row-info]").textContent=total?`${start+1}–${end} dari ${total}`:"0 data";bar.querySelector("[data-row-prev]").disabled=st.page<=1;bar.querySelector("[data-row-next]").disabled=st.page>=pages;
  }
  function setupPagination(cfg){const container=document.querySelector(cfg.selector);if(!container)return;ensureControl(cfg);applyPagination(cfg);new MutationObserver(()=>{const st=pageState.get(cfg.key);st.page=1;queueMicrotask(()=>applyPagination(cfg))}).observe(container,{childList:true})}
  configs.forEach(setupPagination);

  function renderMonthlyPayers(){
    const host=document.getElementById("outstandingList");if(!host||typeof state==="undefined")return;const card=host.closest(".card"),head=card?.querySelector(".card-head");if(head){const title=head.querySelector("h4"),desc=head.querySelector("p");if(title)title.textContent="Periode Warga Sudah Mengangsur";if(desc)desc.textContent="Maksimal 6 periode pembayaran terakhir."}
    const grouped=new Map();for(const payment of state.payments||[]){const key=typeof monthKey==="function"?monthKey(payment.date):String(payment.date||"").slice(0,7);if(!/^\d{4}-\d{2}$/.test(key))continue;if(!grouped.has(key))grouped.set(key,{amount:0,members:new Set()});const row=grouped.get(key);row.amount+=Number(payment.amount||0);if(payment.memberId)row.members.add(payment.memberId)}
    const periods=[...grouped.keys()].sort().slice(-6);if(!periods.length){host.innerHTML="<div class='empty'>Belum ada pembayaran.</div>";return}
    const rows=periods.map(key=>{const [year,month]=key.split("-");const label=new Date(`${key}-01T00:00:00`).toLocaleDateString("id-ID",{month:"long"});const row=grouped.get(key);return `<tr><td>${label}</td><td>${year}</td><td class="money">${typeof rupiah==="function"?rupiah(row.amount):row.amount}</td><td class="count">${row.members.size}</td></tr>`}).join("");
    host.innerHTML=`<table class="monthly-payer-table"><thead><tr><th>Bulan</th><th>Tahun</th><th>Total Angsuran Diterima</th><th>Jumlah Warga Mengangsur</th></tr></thead><tbody>${rows}</tbody></table>`;
  }
  renderMonthlyPayers();
  if(typeof renderDashboard==="function"){const original=renderDashboard;window.renderDashboard=function(...args){const result=original(...args);queueMicrotask(()=>{renderMonthlyPayers();for(const cfg of configs.slice(0,3))applyPagination(cfg)});return result}}
})();
