"use strict";
(async()=>{
  const api=async(url,options={})=>{const r=await fetch(url,options),p=await r.json().catch(()=>({}));if(!r.ok)throw new Error(p.error||`HTTP ${r.status}`);return p};
  const profile=(await api("/api/profile").catch(()=>null))?.profile;if(profile?.roleKey!=="admin")return;
  const tbody=document.getElementById("accountUserRows");if(!tbody)return;
  const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
  const head=tbody.closest("table")?.querySelector("thead tr");if(head&&!head.querySelector(".user-action-head")){const th=document.createElement("th");th.className="user-action-head";th.textContent="Tindakan";head.appendChild(th)}
  async function render(){const [rp,up]=await Promise.all([api("/api/admin/roles"),api("/api/admin/users")]),roles=rp.roles||[];tbody.innerHTML=(up.users||[]).map(u=>`<tr data-id="${esc(u.id)}"><td><strong>${esc(u.username)}</strong></td><td><input class="field edit-name" value="${esc(u.displayName)}"></td><td><select class="field edit-role">${roles.map(r=>`<option value="${esc(r.key)}" ${r.key===u.roleKey?"selected":""}>${esc(r.name)}</option>`).join("")}</select></td><td><select class="field edit-active"><option value="1" ${u.active?"selected":""}>Aktif</option><option value="0" ${!u.active?"selected":""}>Tidak aktif</option></select></td><td>${esc(u.lastLoginAt||"-")}</td><td><button type="button" class="btn small primary save-user">Simpan</button></td></tr>`).join("")}
  tbody.addEventListener("click",async e=>{const btn=e.target.closest(".save-user");if(!btn)return;const row=btn.closest("tr");btn.disabled=true;try{await api("/api/account/update",{method:"PUT",body:JSON.stringify({id:row.dataset.id,displayName:row.querySelector(".edit-name").value,roleKey:row.querySelector(".edit-role").value,active:row.querySelector(".edit-active").value==="1"})});toast("User berhasil diperbarui.");await render()}catch(error){toast(error.message,true)}finally{btn.disabled=false}});
  await render();
})();
