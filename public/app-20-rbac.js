"use strict";
(async function rbacUi(){
  if(!document.querySelector('link[href="/rbac.css"]')){const link=document.createElement("link");link.rel="stylesheet";link.href="/rbac.css";document.head.appendChild(link)}
  const api=async(url,options={})=>{const response=await fetch(url,options),payload=await response.json().catch(()=>({}));if(!response.ok)throw new Error(payload.error||`HTTP ${response.status}`);return payload};
  const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
  let current;
  try{current=await api("/api/permissions/current")}catch(error){console.error("rbac_load_error",error);return}
  window.HOTMIX_PERMISSIONS=current.permissions||{};
  document.body.dataset.accountRole=current.user?.roleKey||"viewer";
  const can=key=>Boolean(window.HOTMIX_PERMISSIONS?.[key]);

  const badge=[...document.querySelectorAll(".top-actions .badge.connected")].find(item=>item.id!=="autoSaveStatus");
  if(badge)badge.textContent=`${current.user.displayName} · ${current.user.role}`;
  const roleDescription=document.getElementById("profileRoleDescription");
  if(roleDescription){const defaults={admin:"Full access. Hak operasional dapat diatur dari Users & Roles.",panitia01:"Akses operasional tanpa Users & Roles; hak hapus default dinonaktifkan.",viewer:"Read-only. Hanya dapat melihat data, bukti pembayaran, dan kwitansi."};roleDescription.textContent=defaults[current.user.roleKey]||current.user.role}

  const idRules={
    addMemberBtn:"members.write",
    addPlanBtn:"plans.write",
    regeneratePlanBtn:"plans.write",
    addPaymentBtn:"payments.write",
    uploadGuideBtn:"guide.update_pdf"
  };
  const actionRules={
    "payment-reminder":"dashboard.reminder",
    "collect-payment":"dashboard.collect",
    "edit-member":"members.write",
    "delete-member":"members.delete",
    "edit-plan":"plans.write",
    "delete-plan":"plans.delete",
    "edit-payment":"payments.write",
    "delete-payment":"payments.delete",
    "view-proof":"payments.proof_view",
    "receipt":"payments.receipt"
  };

  function applyPermissions(root=document){
    for(const [id,key] of Object.entries(idRules)){const node=document.getElementById(id);if(node)node.classList.toggle("rbac-hidden",!can(key))}
    const actions=root.querySelectorAll?.("[data-action]")||[];
    for(const node of actions){const key=actionRules[String(node.dataset.action||"")];if(key)node.classList.toggle("rbac-hidden",!can(key))}
    const userNav=document.querySelector('aside nav [data-page="usersRoles"]');if(userNav)userNav.classList.toggle("rbac-hidden",!can("users_roles.manage"));
    const mobileUserOption=document.querySelector('#mobileNavigation option[value="usersRoles"]');if(mobileUserOption)mobileUserOption.hidden=!can("users_roles.manage");
  }
  applyPermissions();
  new MutationObserver(records=>{for(const record of records)for(const node of record.addedNodes)if(node.nodeType===Node.ELEMENT_NODE)applyPermissions(node)}).observe(document.body,{subtree:true,childList:true});

  document.addEventListener("click",event=>{
    const target=event.target.closest?.("[data-action]");if(!target)return;const key=actionRules[String(target.dataset.action||"")];if(key&&!can(key)){event.preventDefault();event.stopImmediatePropagation();toast?.("Role ini tidak memiliki akses untuk tindakan tersebut.",true)}
  },true);

  if(current.user.roleKey!=="admin"||!can("users_roles.manage"))return;
  const roleCards=document.getElementById("roleCards");if(!roleCards)return;

  async function renderRoleMatrix(){
    const payload=await api("/api/admin/roles"),roles=payload.roles||[],catalog=payload.catalog||[];
    const groups=new Map();for(const item of catalog){if(!groups.has(item.menu))groups.set(item.menu,[]);groups.get(item.menu).push(item)}
    roleCards.className="rbac-matrix";
    roleCards.innerHTML=`<div class="rbac-readonly-note">Hak <strong>Users & Roles</strong> dikunci hanya untuk Admin agar tidak terjadi kehilangan akses administrasi. Hak lain dapat diubah dengan checklist lalu disimpan per role.</div>`+roles.map(role=>{
      const groupHtml=[...groups.entries()].map(([menu,items])=>`<div class="rbac-group"><strong>${esc(menu)}</strong>${items.map(item=>{const locked=item.key==="users_roles.manage";const checked=Boolean(role.permissions?.[item.key]);return `<label class="rbac-check ${locked?"locked":""}"><input type="checkbox" data-permission="${esc(item.key)}" ${checked?"checked":""} ${locked?"disabled":""}><span>${esc(item.label)}</span></label>`}).join("")}</div>`).join("");
      return `<section class="rbac-role" data-role-key="${esc(role.key)}"><div class="rbac-role-head"><div><h5>${esc(role.name)}</h5><p>${esc(role.description)}</p></div><span class="badge">${esc(role.key)}</span></div><div class="rbac-permission-groups">${groupHtml}</div><div class="rbac-save-row"><button type="button" class="btn primary rbac-save">Simpan Hak Akses</button></div><div class="rbac-status" aria-live="polite"></div></section>`
    }).join("");
  }

  roleCards.addEventListener("click",async event=>{
    const button=event.target.closest(".rbac-save");if(!button)return;const card=button.closest(".rbac-role"),roleKey=card.dataset.roleKey,status=card.querySelector(".rbac-status"),permissions={};
    for(const input of card.querySelectorAll("[data-permission]"))permissions[input.dataset.permission]=input.checked;
    button.disabled=true;status.textContent="Menyimpan...";
    try{const result=await api(`/api/admin/roles/${encodeURIComponent(roleKey)}`,{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify({permissions})});status.textContent="Hak akses berhasil disimpan.";if(roleKey===current.user.roleKey){window.HOTMIX_PERMISSIONS=result.permissions||permissions;applyPermissions()}}
    catch(error){status.textContent=error.message||"Gagal menyimpan hak akses."}
    finally{button.disabled=false}
  });

  try{await renderRoleMatrix()}catch(error){roleCards.innerHTML=`<div class="empty">${esc(error.message||"Gagal memuat role permissions.")}</div>`}
})();
