"use strict";
    (function applyRngbUiEnhancements(){
      if(!document.querySelector('link[data-rngb-responsive="true"]')){
        const stylesheet=document.createElement("link");
        stylesheet.rel="stylesheet";
        stylesheet.href="/styles-04-responsive.css";
        stylesheet.dataset.rngbResponsive="true";
        document.head.appendChild(stylesheet);
      }

      const cloudStatus=el("autoSaveStatus");
      if(cloudStatus){cloudStatus.hidden=true;cloudStatus.setAttribute("aria-hidden","true");}

      const brandVersion=document.querySelector(".brand small");
      if(brandVersion)brandVersion.textContent="Wilayah Atas · v1.1.0-rngb";

      if(typeof window.drawReceipt==="function"&&!window.__rngbReceiptVersionPatched){
        const originalDrawReceipt=window.drawReceipt;
        window.drawReceipt=function(payment){
          const canvas=originalDrawReceipt(payment),ctx=canvas?.getContext?.("2d");
          if(ctx){
            ctx.save();
            ctx.fillStyle="#ffffff";
            ctx.fillRect(830,1298,186,34);
            ctx.textAlign="right";
            ctx.fillStyle="#657269";
            ctx.font="600 18px Arial, sans-serif";
            ctx.fillText("v1.1.0-rngb",1008,1322);
            ctx.restore();
          }
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
    state.members.forEach(member=>{member.tanggalAngsuran=installmentDate(member);assignAutomaticPeriods(member.id);});persistLocal();renderAll();renderPaymentConfig();setProofFolderStatus();initializeAutomaticStorage();
