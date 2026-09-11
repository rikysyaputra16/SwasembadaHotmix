"use strict";
    async function selectProofDirectory(){
      toast(cloudReady?"Cloudflare R2 aktif. Tidak diperlukan pemilihan folder lokal.":"Cloudflare belum terhubung.",!cloudReady);
    }
    async function viewProof(paymentId){
      try{
        const payment=state.payments.find(item=>item.id===paymentId);
        const file=await physicalProofFile(payment);
        if(!file){toast("Bukti belum tersedia di Cloudflare R2. Untuk data lama, jalankan migrasi bukti R2 atau unggah ulang bukti pada transaksi.",true);return;}
        const url=URL.createObjectURL(file),opened=window.open(url,"_blank");
        if(!opened){const link=document.createElement("a");link.href=url;link.download=file.name||payment?.proofName||"bukti-pembayaran";link.click();}
        setTimeout(()=>URL.revokeObjectURL(url),60000);
      }catch(error){toast(error.message,true);}
    }

    function loadLocal(){
      try{const saved=JSON.parse(localStorage.getItem(STORAGE_KEY));if(saved?.members?.length){saved.members.forEach(m=>m.planType=m.planType||defaultPlanType(m));const rawPlans=Array.isArray(saved.plans)?saved.plans:saved.members.flatMap(m=>generatePlans(m,m.planType)),plans=normalizePlanMonths(rawPlans),payments=(saved.payments||[]).map(payment=>({...payment,category:payment.category==="DP Awal"?"Custom Pembayaran":payment.category||"Cicilan",paymentType:payment.paymentType==="DP Awal"?"Custom Pembayaran":payment.paymentType}));return {members:saved.members,payments,plans,fileName:saved.fileName||"Swasembada_Hotmix_RT_Atas.xlsx",reportMonth:rollingReportMonth(saved.reportMonth),historyMonth:monthKey(saved.historyMonth)||currentMonth(),historyMember:String(saved.historyMember||""),defaultReceiver:String(saved.defaultReceiver||""),paymentBank:String(saved.paymentBank||""),paymentAccount:String(saved.paymentAccount||""),paymentAccountName:String(saved.paymentAccountName||""),cashCollectors:String(saved.cashCollectors||""),defaultOfficer:String(saved.defaultOfficer||""),defaultCompanion:String(saved.defaultCompanion||"")};}}catch(_e){}
      const members=clone(SEED_MEMBERS);return {members,payments:[],plans:[],fileName:"Swasembada_Hotmix_RT_Atas.xlsx",reportMonth:currentMonth(),historyMonth:currentMonth(),historyMember:"",defaultReceiver:"",paymentBank:"",paymentAccount:"",paymentAccountName:"",cashCollectors:"",defaultOfficer:"",defaultCompanion:""};
    }
    function persistLocal(){localStorage.setItem(STORAGE_KEY,JSON.stringify({members:state.members,payments:state.payments,plans:state.plans,fileName:state.fileName,reportMonth:state.reportMonth,historyMonth:state.historyMonth,historyMember:state.historyMember||"",defaultReceiver:state.defaultReceiver||"",paymentBank:state.paymentBank||"",paymentAccount:state.paymentAccount||"",paymentAccountName:state.paymentAccountName||"",cashCollectors:state.cashCollectors||"",defaultOfficer:state.defaultOfficer||"",defaultCompanion:state.defaultCompanion||""}));}
    const rupiah = n => new Intl.NumberFormat("id-ID",{style:"currency",currency:"IDR",maximumFractionDigits:0}).format(Number(n)||0);
    const angka = n => new Intl.NumberFormat("id-ID",{maximumFractionDigits:0}).format(Number(n)||0);
    const esc = v => String(v??"").replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));
    const today = () => new Date().toISOString().slice(0,10);
    function monthKey(value){if(value instanceof Date&&!isNaN(value))return `${value.getFullYear()}-${String(value.getMonth()+1).padStart(2,"0")}`;const match=String(value||"").match(/^(\d{4})-(\d{2})/);return match?`${match[1]}-${match[2]}`:"";}
    function currentMonth(){return monthKey(new Date());}
    function rollingReportMonth(value){const selected=monthKey(value),current=currentMonth();return selected&&selected>current?selected:current;}
    function addMonths(month,offset){const [year,number]=String(month||DEFAULT_PROGRAM_START_MONTH).split("-").map(Number),date=new Date(year,number-1+Number(offset||0),1);return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}`;}
    function monthLabel(month){if(!month)return "Belum ditentukan";const [year,number]=month.split("-").map(Number);return new Intl.DateTimeFormat("id-ID",{month:"long",year:"numeric"}).format(new Date(year,number-1,1));}
    function normalizePlanMonths(plans){return plans.map(plan=>({...plan,dueMonth:monthKey(plan.dueMonth)||addMonths(DEFAULT_PROGRAM_START_MONTH,Math.max(0,Number(plan.sequence||1)-1))}));}
    function paidFor(id,ignorePaymentId=""){return state.payments.filter(p=>p.memberId===id&&p.id!==ignorePaymentId).reduce((s,p)=>s+Number(p.amount||0),0);}
    function paymentWithinMonth(payment,asOfMonth=""){return !asOfMonth||!monthKey(payment.date)||monthKey(payment.date)<=asOfMonth;}
    function isCustomPayment(payment){return payment?.category==="Custom Pembayaran"||payment?.category==="DP Awal";}
    function paymentTotalFor(id,ignorePaymentId="",asOfMonth=""){return state.payments.filter(payment=>payment.memberId===id&&payment.id!==ignorePaymentId&&paymentWithinMonth(payment,asOfMonth)).reduce((sum,payment)=>sum+Number(payment.amount||0),0);}
    function allocationProfile(memberId,totalPaid){const plans=state.plans.filter(plan=>plan.memberId===memberId).sort((a,b)=>Number(a.sequence)-Number(b.sequence));let available=Math.max(0,Number(totalPaid||0)),fullCount=0;for(const plan of plans){const amount=Math.max(0,Number(plan.amount||0));if(amount<=0){fullCount++;continue;}if(available<amount)break;available-=amount;fullCount++;}return {plans,fullCount,tailCredit:available};}
    function downPaymentFor(id,ignorePaymentId="",asOfMonth=""){return allocationProfile(id,paymentTotalFor(id,ignorePaymentId,asOfMonth)).tailCredit;}
    function installmentPaidFor(id,ignorePaymentId="",asOfMonth=""){return paymentTotalFor(id,ignorePaymentId,asOfMonth);}
    function effectivePlanAmounts(memberId,ignorePaymentId="",asOfMonth=""){const profile=allocationProfile(memberId,paymentTotalFor(memberId,ignorePaymentId,asOfMonth)),amounts=new Map(profile.plans.map(plan=>[plan.id,Number(plan.amount||0)]));let excessRemaining=profile.tailCredit;for(let index=profile.plans.length-1;index>=profile.fullCount&&excessRemaining>0;index--){const plan=profile.plans[index],original=Number(plan.amount||0),reduction=Math.min(original,excessRemaining);amounts.set(plan.id,original-reduction);excessRemaining-=reduction;}return amounts;}
    function termCount(member){if((member.planType||defaultPlanType(member))==="Bayar Penuh")return 1;const match=String(member.lamaAngsuran||"").match(/\d+/);return Math.max(1,Number(match?.[0]||1));}
    function totalPeriodsForMember(memberId){const count=state.plans.filter(plan=>plan.memberId===memberId).length,member=state.members.find(item=>item.id===memberId);return count||(member?termCount(member):0);}
    function historyPeriodLabel(payment){const total=totalPeriodsForMember(payment.memberId);return payment.period?`periode ${payment.period} dari ${total}`:`belum melunasi periode penuh dari ${total}`;}
    function refreshHistoryMembers(){const select=el("historyMember"),selected=state.members.some(member=>member.id===state.historyMember)?state.historyMember:"";state.historyMember=selected;select.innerHTML=`<option value="">Semua Anggota</option>`+[...state.members].sort((a,b)=>String(a.noRumah).localeCompare(String(b.noRumah),"id",{numeric:true})||String(a.nama).localeCompare(String(b.nama),"id")).map(member=>`<option value="${esc(member.id)}">${esc(member.nama)} · Rumah ${esc(member.noRumah)}</option>`).join("");select.value=selected;}
    function generatePlans(member,type=member.planType||defaultPlanType(member)){
      const count=type==="Bayar Penuh"?1:termCount({...member,planType:type}),total=Number(member.totalBiaya||0),nominal=Number(member.nominalAngsuran||0);let amounts=Array(count).fill(nominal);if(count===1)amounts=[total];else{amounts[count-1]=total-nominal*(count-1);if(amounts[count-1]<=0){const base=Math.floor(total/count);amounts=Array(count).fill(base);amounts[count-1]=total-base*(count-1);}}
      return amounts.map((amount,index)=>({id:`REN-${member.id}-${String(index+1).padStart(2,"0")}`,memberId:member.id,type,sequence:index+1,dueMonth:addMonths(DEFAULT_PROGRAM_START_MONTH,index),dueLabel:member.tanggalAngsuran||"Belum ditentukan",amount,note:type==="Custom"?"Pembayaran dapat berbeda; nominal rencana tetap dan selisih dialokasikan kumulatif.":""}));
    }
    function planAllocations(ignorePaymentId="",asOfMonth=""){const result=new Map(),groups=new Map();state.plans.forEach(plan=>{if(!groups.has(plan.memberId))groups.set(plan.memberId,[]);groups.get(plan.memberId).push(plan);});for(const [memberId,plans] of groups){const profile=allocationProfile(memberId,paymentTotalFor(memberId,ignorePaymentId,asOfMonth)),effectiveAmounts=effectivePlanAmounts(memberId,ignorePaymentId,asOfMonth);plans.sort((a,b)=>Number(a.sequence)-Number(b.sequence)).forEach((plan,index)=>{const original=Number(plan.amount||0),planned=Math.max(0,Number(effectiveAmounts.get(plan.id)||0)),dpReduction=Math.max(0,original-planned),allocated=index<profile.fullCount?original:0,remaining=index<profile.fullCount?0:planned,status=index<profile.fullCount?"Lunas":planned<=0&&dpReduction>0?"Disesuaikan Lebih Bayar":"Belum Dibayar";result.set(plan.id,{original,planned,dpReduction,allocated,remaining,status});});}return result;}
