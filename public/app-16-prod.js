"use strict";
(function(){
  if(!document.querySelector('link[data-rngb-responsive="true"]')){
    const s=document.createElement("link");s.rel="stylesheet";s.href="/styles-04-responsive.css";s.dataset.rngbResponsive="true";document.head.appendChild(s);
  }
  const status=el("autoSaveStatus");
  if(status){status.hidden=true;status.setAttribute("aria-hidden","true");}
  const version=document.querySelector(".brand small");
  if(version)version.textContent="Wilayah Atas · v1.1.0-rngb";
  if(typeof window.drawReceipt==="function"&&!window.__rngbReceiptVersionPatched){
    const original=window.drawReceipt;
    window.drawReceipt=function(payment){
      const canvas=original(payment),ctx=canvas?.getContext?.("2d");
      if(ctx){ctx.save();ctx.fillStyle="#fff";ctx.fillRect(820,1296,198,36);ctx.textAlign="right";ctx.fillStyle="#657269";ctx.font="600 18px Arial, sans-serif";ctx.fillText("v1.1.0-rngb",1008,1322);ctx.restore();}
      return canvas;
    };
    window.__rngbReceiptVersionPatched=true;
  }
})();
el("connectBtn").addEventListener("click",()=>saveExcel(false).catch(e=>toast(e.message,true)));
el("saveBtn").addEventListener("click",()=>saveExcel(false).catch(e=>toast(e.message,true)));
el("proofFolderBtn").addEventListener("click",selectProofDirectory);
el("setupDoneBtn").addEventListener("click",()=>el("storageDialog").close());
el("exportExcelBtn").addEventListener("click",()=>saveExcel(false).catch(e=>toast(e.message,true)));
state.members.forEach(m=>{m.tanggalAngsuran=installmentDate(m);assignAutomaticPeriods(m.id)});
persistLocal();renderAll();renderPaymentConfig();setProofFolderStatus();initializeAutomaticStorage();
const first=document.createElement("script");
first.src="/app-17.js";
first.onload=()=>{const second=document.createElement("script");second.src="/app-19.js";document.body.appendChild(second);};
document.body.appendChild(first);
