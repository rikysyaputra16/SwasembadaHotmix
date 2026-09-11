"use strict";
    const SEED_MEMBERS = []; // Real member data is loaded from private Cloudflare D1.

    const CUSTOM_MEMBER_IDS = new Set(); // Plan type is persisted in D1.
    function defaultPlanType(member){return String(member.lamaAngsuran||"").toLowerCase().includes("bayar penuh")?"Bayar Penuh":CUSTOM_MEMBER_IDS.has(member.id)?"Custom":"Tetap";}
    SEED_MEMBERS.forEach(member=>member.planType=defaultPlanType(member));
    const APP_VERSION = "1.1.0-cloudflare";
    const DEFAULT_PROGRAM_START_MONTH = "2026-08";
    const STORAGE_KEY = "hotmix-rt-atas-v1";
    const el = id => document.getElementById(id);
    const clone = obj => JSON.parse(JSON.stringify(obj));
    let fileHandle = null;
    let sourceWorkbook = null;
    let state = loadLocal();
    let pendingProofFile = null;
    let proofStorageReady = false;
    let excelStorageReady = false;
    const PROOF_DB_NAME = "hotmix-bukti-pembayaran";
    const PROOF_LEGACY_STORE = "bukti";
    const PROOF_SETTINGS_STORE = "pengaturan";
    const PROOF_FOLDER_KEY = "folder-root";
    const EXCEL_FILE_KEY = "excel-file";
    const PROOF_FOLDER_NAME = "upload";
    const PROOF_RELATIVE_PREFIX = "..\\upload";
    const LEGACY_PROOF_SUBFOLDER = "Bukti Pembayaran Hotmix";
    let proofDirectoryHandle = null;
    let cloudReady = false;

    async function apiJson(url, options={}){
      const response=await fetch(url,{...options,headers:{...(options.body instanceof FormData?{}:{"Content-Type":"application/json"}),...(options.headers||{})}});
      const contentType=response.headers.get("content-type")||"";
      const payload=contentType.includes("application/json")?await response.json():null;
      if(!response.ok)throw new Error(payload?.error||`HTTP ${response.status}`);
      return payload;
    }
    async function cloudMutate(mutation){
      if(!cloudReady)throw new Error("Cloudflare D1 belum terhubung.");
      return apiJson("/api/mutate",{method:"POST",body:JSON.stringify(mutation)});
    }
    async function saveSettingsRemote(){
      if(!cloudReady)return;
      await apiJson("/api/settings",{method:"PUT",body:JSON.stringify({reportMonth:state.reportMonth||"",historyMonth:state.historyMonth||"",historyMember:state.historyMember||""})});
    }

    function openProofDb(){
      return new Promise((resolve,reject)=>{
        if(typeof indexedDB==="undefined"){reject(new Error("Penyimpanan pengaturan folder tidak didukung browser ini."));return;}
        const request=indexedDB.open(PROOF_DB_NAME,2);
        request.onupgradeneeded=()=>{
          const db=request.result;
          if(!db.objectStoreNames.contains(PROOF_LEGACY_STORE))db.createObjectStore(PROOF_LEGACY_STORE);
          if(!db.objectStoreNames.contains(PROOF_SETTINGS_STORE))db.createObjectStore(PROOF_SETTINGS_STORE);
        };
        request.onsuccess=()=>resolve(request.result);
        request.onerror=()=>reject(request.error||new Error("Gagal membuka pengaturan folder bukti."));
      });
    }
    async function proofDbValue(store,key,value,write=false){
      const db=await openProofDb();
      return new Promise((resolve,reject)=>{
        const tx=db.transaction(store,write?"readwrite":"readonly"),objectStore=tx.objectStore(store);
        if(write)objectStore.put(value,key);
        else{const request=objectStore.get(key);request.onsuccess=()=>resolve(request.result||null);request.onerror=()=>reject(request.error);}
        tx.oncomplete=()=>{db.close();if(write)resolve(value);};
        tx.onerror=()=>{db.close();reject(tx.error||new Error("Operasi penyimpanan bukti gagal."));};
      });
    }
    async function deleteLegacyProof(paymentId){
      try{
        const db=await openProofDb();
        await new Promise((resolve,reject)=>{const tx=db.transaction(PROOF_LEGACY_STORE,"readwrite");tx.objectStore(PROOF_LEGACY_STORE).delete(paymentId);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});
        db.close();
      }catch(_e){}
    }
    const getLegacyProof=paymentId=>proofDbValue(PROOF_LEGACY_STORE,paymentId);
    function setProofFolderStatus(){
      const badge=el("proofFolderBadge");
      if(!badge)return;
      badge.textContent=cloudReady?"R2 aktif":"R2 belum terhubung";
      badge.className=cloudReady?"badge connected":"badge";
      refreshAutomaticStorageUi();
    }
    async function ensureDirectoryPermission(handle,write=true){
      if(!handle)return false;
      const options={mode:write?"readwrite":"read"};
      if(!handle.queryPermission||!handle.requestPermission)return true;
      if((await handle.queryPermission(options))==="granted")return true;
      return (await handle.requestPermission(options))==="granted";
    }
    async function hasDirectoryPermission(handle,write=true){if(!handle)return false;if(!handle.queryPermission)return true;return (await handle.queryPermission({mode:write?"readwrite":"read"}))==="granted";}
    async function restoreProofDirectory(){
      try{const restored=await proofDbValue(PROOF_SETTINGS_STORE,PROOF_FOLDER_KEY);if(!proofDirectoryHandle)proofDirectoryHandle=restored;setProofFolderStatus();}catch(_e){setProofFolderStatus();}
    }
    async function getProofDirectory(write=false){
      if(!proofDirectoryHandle)throw new Error("Folder default outputs/upload belum diaktifkan.");
      if(!await ensureDirectoryPermission(proofDirectoryHandle,write))throw new Error("Izin folder outputs/upload tidak diberikan.");
      proofStorageReady=true;refreshAutomaticStorageUi();
      return proofDirectoryHandle;
    }
    async function proofStorageEntry(payment){
      const root=await getProofDirectory(false),name=String(payment.proofPath||"").split(/[\\/]/).pop();
      if(String(payment.proofPath||"").includes(LEGACY_PROOF_SUBFOLDER)){
        const directory=await root.getDirectoryHandle(LEGACY_PROOF_SUBFOLDER);
        return {directory,name};
      }
      return {directory:root,name};
    }
    function safeProofName(name){
      const cleaned=String(name||"bukti").replace(/[<>:"/\\|?*\u0000-\u001F]/g,"-").replace(/\s+/g," ").trim();
      return cleaned||"bukti";
    }
    function proofFileName(paymentId,originalName){
      const safe=safeProofName(originalName),dot=safe.lastIndexOf("."),base=(dot>0?safe.slice(0,dot):safe).slice(0,90),ext=dot>0?safe.slice(dot).slice(0,12):"";
      return `${safeProofName(paymentId)}-${base}${ext}`;
    }
    async function saveProofFile(paymentId,file){
      if(!cloudReady)throw new Error("Cloudflare belum terhubung.");
      const form=new FormData();form.append("file",file,file.name);
      const result=await apiJson(`/api/proofs/upload/${encodeURIComponent(paymentId)}`,{method:"POST",body:form});
      return {name:result.name,type:result.type,path:result.key};
    }
    async function physicalProofFile(payment){
      if(!payment?.proofPath)return null;
      const response=await fetch(`/api/proofs/object/${encodeURIComponent(payment.proofPath)}`);
      if(response.status===404)return null;
      if(!response.ok)throw new Error(`Bukti gagal dibuka (HTTP ${response.status}).`);
      const blob=await response.blob();
      return new File([blob],payment.proofName||"bukti-pembayaran",{type:payment.proofType||blob.type||"application/octet-stream"});
    }
    async function deletePaymentProofs(payments){
      let deleted=0;
      for(const payment of payments){
        if(!payment?.proofPath)continue;
        const response=await fetch(`/api/proofs/object/${encodeURIComponent(payment.proofPath)}`,{method:"DELETE"});
        if(!response.ok&&response.status!==404){const payload=await response.json().catch(()=>null);throw new Error(payload?.error||`Gagal menghapus bukti ${payment.proofName||payment.id}.`);}
        deleted++;
      }
      return deleted;
    }
    async function migrateLegacyProofs(){
      let migrated=0;
      for(const payment of state.payments.filter(item=>item.proofName&&!item.proofPath)){
        const legacy=await getLegacyProof(payment.id).catch(()=>null);
        if(!legacy)continue;
        const info=await saveProofFile(payment.id,legacy);
        payment.proofName=info.name;payment.proofType=info.type;payment.proofPath=info.path;
        await deleteLegacyProof(payment.id);
        migrated++;
      }
      if(migrated){persistLocal();renderAll();if(fileHandle)await saveExcel(true);}
      return migrated;
    }
    async function migrateLegacyPhysicalProofs(){
      let migrated=0;
      for(const payment of state.payments.filter(item=>String(item.proofPath||"").includes(LEGACY_PROOF_SUBFOLDER))){
        try{
          const oldEntry=await proofStorageEntry(payment),file=await (await oldEntry.directory.getFileHandle(oldEntry.name)).getFile(),directory=await getProofDirectory(true),handle=await directory.getFileHandle(oldEntry.name,{create:true}),writable=await handle.createWritable();
          await writable.write(file);await writable.close();await oldEntry.directory.removeEntry(oldEntry.name);
          payment.proofPath=`${PROOF_RELATIVE_PREFIX}\\${oldEntry.name}`;migrated++;
        }catch(_e){}
      }
      if(migrated){persistLocal();renderAll();if(fileHandle)await saveExcel(true);}
      return migrated;
    }
