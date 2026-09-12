"use strict";
(async function accountEnhancement(){
  const cssFiles=["/mobile-nav.css","/mobile-history.css","/mobile-matrix.css","/mobile-arrears.css","/account.css"];
  for(const href of cssFiles){if(!document.querySelector(`link[href="${href}"]`)){const link=document.createElement("link");link.rel="stylesheet";link.href=href;document.head.appendChild(link);}}

  const escText=value=>String(value??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[ch]));
  const requestJson=async(url,options={})=>{const response=await fetch(url,options),payload=await response.json().catch(()=>({}));if(!response.ok)throw new Error(payload.error||`HTTP ${response.status}`);return payload;};
  const content=document.querySelector(".content"),nav=document.querySelector("aside nav"),brand=document.querySelector(".brand");
  if(!content||!nav||!brand)return;

  let profile;
  try{profile=(await requestJson("/api/profile")).profile;}catch(error){console.error("profile_load_error",error);return;}
  document.body.dataset.accountRole=profile.roleKey;
  const userBadge=[...document.querySelectorAll(".top-actions .badge.connected")].find(item=>item.id!=="autoSaveStatus");
  if(userBadge)userBadge.textContent=`${profile.displayName} · ${profile.role}`;

  const addNav=(page,label)=>{if(nav.querySelector(`[data-page="${page}"]`))return;const button=document.createElement("button");button.className="nav-btn";button.dataset.page=page;button.textContent=label;nav.appendChild(button);};
  addNav("profile","Profil Saya");
  if(profile.roleKey==="admin")addNav("usersRoles","Users & Roles");

  const profileSection=document.createElement("section");
  profileSection.id="profile";profileSection.className="page";
  profileSection.innerHTML=`
    <div class="page-head"><div><h3>Profil Saya</h3><p>Kelola nama tampilan dan password akun yang sedang digunakan.</p></div></div>
    <div class="account-grid">
      <div class="card account-panel">
        <h4>Informasi Akun</h4>
        <div class="profile-meta">
          <div><span>Username</span><strong>${escText(profile.username)}</strong></div>
          <div><span>Group Role</span><strong>${escText(profile.role)}</strong></div>
          <div><span>Login Terakhir</span><strong>${escText(profile.lastLoginAt||"-")}</strong></div>
          <div><span>Status</span><strong>${profile.active?"Aktif":"Tidak aktif"}</strong></div>
        </div>
        <form id="profileForm">
          <div class="form-grid">
            <div class="form-group full"><label for="profileDisplayName">Nama Tampilan</label><input id="profileDisplayName" value="${escText(profile.displayName)}" required></div>
            <div class="form-group"><label for="profileCurrentPassword">Password Saat Ini</label><input id="profileCurrentPassword" type="password" autocomplete="current-password"><small>Wajib jika ingin mengganti password.</small></div>
            <div class="form-group"><label for="profileNewPassword">Password Baru</label><input id="profileNewPassword" type="password" autocomplete="new-password"><small>Minimal 12 karakter, huruf besar/kecil, angka, dan simbol.</small></div>
          </div>
          <div class="account-actions"><button class="btn primary" type="submit">Simpan Profil</button></div>
          <div id="profileMessage" class="account-message"></div>
        </form>
      </div>
      <div class="card account-panel"><h4>Hak Akses</h4><p id="profileRoleDescription">Memuat informasi role...</p></div>
    </div>`;
  content.appendChild(profileSection);

  let roles=[];
  if(profile.roleKey==="admin"){
    const usersSection=document.createElement("section");
    usersSection.id="usersRoles";usersSection.className="page";
    usersSection.innerHTML=`
      <div class="page-head"><div><h3>Users & Roles</h3><p>Khusus Admin. Buat user dan tentukan group role dari dropdown.</p></div></div>
      <div class="account-grid">
        <div class="card account-panel">
          <h4>Daftar User</h4><p>User aktif maupun nonaktif dari database autentikasi.</p>
          <div class="table-scroll"><table class="data-table user-table"><thead><tr><th>Username</th><th>Nama</th><th>Group Role</th><th>Status</th><th>Login Terakhir</th></tr></thead><tbody id="accountUserRows"></tbody></table></div>
        </div>
        <div class="card account-panel">
          <h4>Tambah User</h4><p>Password tidak pernah ditampilkan kembali setelah user dibuat.</p>
          <form id="createUserForm"><div class="form-grid">
            <div class="form-group"><label for="newUsername">Username</label><input id="newUsername" required autocomplete="off"></div>
            <div class="form-group"><label for="newDisplayName">Nama Tampilan</label><input id="newDisplayName" required></div>
            <div class="form-group"><label for="newUserRole">Group Role</label><select id="newUserRole" required></select></div>
            <div class="form-group"><label for="newUserPassword">Password Awal</label><input id="newUserPassword" type="password" required autocomplete="new-password"></div>
          </div><div class="account-actions"><button class="btn primary" type="submit">Buat User</button></div><div id="createUserMessage" class="account-message"></div></form>
        </div>
      </div>
      <div class="card account-panel" style="margin-top:18px"><h4>Group Roles</h4><div id="roleCards" class="role-cards"></div></div>`;
    content.appendChild(usersSection);
  }

  const buildMobileNav=()=>{
    let wrap=brand.parentElement.querySelector(".mobile-nav-wrap");if(wrap)wrap.remove();
    wrap=document.createElement("div");wrap.className="mobile-nav-wrap";
    const select=document.createElement("select");select.className="mobile-nav-select";select.id="mobileNavigation";
    for(const button of nav.querySelectorAll("[data-page]")){const option=document.createElement("option");option.value=button.dataset.page;option.textContent=button.textContent.trim();if(button.classList.contains("active"))option.selected=true;select.appendChild(option);}
    const label=document.createElement("label");label.htmlFor="mobileNavigation";label.textContent="Menu aplikasi";wrap.append(label,select);nav.parentElement.insertBefore(wrap,nav);
    select.addEventListener("change",()=>{const target=nav.querySelector(`[data-page="${CSS.escape(select.value)}"]`);if(target)target.click();window.scrollTo({top:0,behavior:"smooth"});});
    document.addEventListener("click",event=>{const button=event.target.closest?.("[data-page]");if(button&&select.querySelector(`option[value="${CSS.escape(button.dataset.page)}"]`))select.value=button.dataset.page;});
  };
  buildMobileNav();

  const profileDescription=document.getElementById("profileRoleDescription");
  const defaultDescriptions={admin:"Full access termasuk Users & Roles dan seluruh data operasional.",panitia01:"Akses operasional penuh seperti Admin, tetapi tanpa akses Users & Roles.",viewer:"Read-only: hanya melihat data, laporan, bukti, kwitansi, dan profil."};
  profileDescription.textContent=defaultDescriptions[profile.roleKey]||profile.role;

  document.getElementById("profileForm").addEventListener("submit",async event=>{
    event.preventDefault();const message=document.getElementById("profileMessage");message.className="account-message";message.textContent="Menyimpan...";
    try{const result=await requestJson("/api/profile",{method:"PUT",body:JSON.stringify({displayName:document.getElementById("profileDisplayName").value,currentPassword:document.getElementById("profileCurrentPassword").value,newPassword:document.getElementById("profileNewPassword").value})});if(result.reauthenticate){location.replace("/login");return;}message.textContent="Profil berhasil diperbarui.";document.getElementById("profileCurrentPassword").value="";document.getElementById("profileNewPassword").value="";}catch(error){message.className="account-message error";message.textContent=error.message;}
  });

  if(profile.roleKey==="admin"){
    const loadAdminData=async()=>{const [rolePayload,userPayload]=await Promise.all([requestJson("/api/admin/roles"),requestJson("/api/admin/users")]);roles=rolePayload.roles||[];const select=document.getElementById("newUserRole");select.innerHTML=roles.map(role=>`<option value="${escText(role.key)}">${escText(role.name)}</option>`).join("");document.getElementById("roleCards").innerHTML=roles.map(role=>`<div class="role-card"><strong>${escText(role.name)}</strong><span>${escText(role.description)}</span></div>`).join("");document.getElementById("accountUserRows").innerHTML=(userPayload.users||[]).map(user=>`<tr><td><strong>${escText(user.username)}</strong></td><td>${escText(user.displayName)}</td><td>${escText(user.role)}</td><td>${user.active?"Aktif":"Tidak aktif"}${user.locked?" · Terkunci":""}</td><td>${escText(user.lastLoginAt||"-")}</td></tr>`).join("")||"<tr><td colspan='5' class='empty'>Belum ada user.</td></tr>";};
    await loadAdminData().catch(error=>{document.getElementById("accountUserRows").innerHTML=`<tr><td colspan="5" class="empty">${escText(error.message)}</td></tr>`;});
    document.getElementById("createUserForm").addEventListener("submit",async event=>{event.preventDefault();const message=document.getElementById("createUserMessage");message.className="account-message";message.textContent="Membuat user...";try{await requestJson("/api/admin/users",{method:"POST",body:JSON.stringify({username:document.getElementById("newUsername").value,displayName:document.getElementById("newDisplayName").value,roleKey:document.getElementById("newUserRole").value,password:document.getElementById("newUserPassword").value})});event.target.reset();message.textContent="User berhasil dibuat.";await loadAdminData();}catch(error){message.className="account-message error";message.textContent=error.message;}});
  }
})();
