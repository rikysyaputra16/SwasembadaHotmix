"use strict";
    el("connectBtn").addEventListener("click",()=>saveExcel(false).catch(e=>toast(e.message,true)));
    el("saveBtn").addEventListener("click",()=>saveExcel(false).catch(e=>toast(e.message,true)));
    el("proofFolderBtn").addEventListener("click",selectProofDirectory);
    el("setupDoneBtn").addEventListener("click",()=>el("storageDialog").close());
    el("exportExcelBtn").addEventListener("click",()=>saveExcel(false).catch(e=>toast(e.message,true)));
    state.members.forEach(member=>{member.tanggalAngsuran=installmentDate(member);assignAutomaticPeriods(member.id);});persistLocal();renderAll();renderPaymentConfig();setProofFolderStatus();initializeAutomaticStorage();
