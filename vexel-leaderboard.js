/* VEXEL GAMES SDK
 * Leaderboard dan konfirmasi tombol Back HP otomatis dipasang oleh Cloudflare Worker saat game diunggah.
 * Game cukup mengirim event: window.dispatchEvent(new CustomEvent('vexel:gameover',{detail:{score: SCORE}}));
 */
(function(){
  'use strict';
  if(window.VexelLeaderboard) return;
  const script=document.currentScript;
  const API=(script&&script.dataset.api)||'https://vexel-games-uploader.vexelkang.workers.dev';
  let GAME_ID=(script&&script.dataset.gameId)||location.pathname.split('/').filter(Boolean)[1]||'game';
  const TOKEN_KEY='vexel_player_session';
  let initialized=false, submitting=false, lastSubmitted=null, profile=null;
  const $=s=>document.querySelector(s);

  // KONFIRMASI TOMBOL BACK HP — berlaku untuk semua game yang memakai SDK ini.
  function setupBackConfirmation(){
    if(window.__vexelGameBackGuardInstalled) return;
    window.__vexelGameBackGuardInstalled=true;
    let dialog=null, navigating=false, keyHandler=null;
    const closeDialog=()=>{if(dialog) dialog.remove();dialog=null;if(keyHandler){document.removeEventListener('keydown',keyHandler);keyHandler=null;}};
    const showDialog=()=>{
      if(dialog) return;
      dialog=document.createElement('div');
      dialog.id='vx-game-back-confirm';
      dialog.setAttribute('role','presentation');
      dialog.innerHTML='<div class="vx-game-back-card" role="dialog" aria-modal="true" aria-labelledby="vx-game-back-title"><div class="vx-game-back-icon">↩️</div><h2 id="vx-game-back-title">Kembali ke beranda?</h2><p>Anda yakin akan kembali ke beranda VEXEL GAMES?</p><div class="vx-game-back-actions"><button type="button" data-vx-back="no">TIDAK</button><button type="button" data-vx-back="yes">IYA</button></div></div>';
      const style=document.createElement('style');
      style.id='vx-game-back-style';
      style.textContent='#vx-game-back-confirm{position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(2,6,18,.78);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#fff}#vx-game-back-confirm .vx-game-back-card{width:min(100%,360px);padding:25px 22px 20px;border:1px solid rgba(126,165,255,.3);border-radius:22px;background:linear-gradient(145deg,#172443,#0c1428);box-shadow:0 22px 70px #0009;text-align:center;animation:vxBackPop .18s ease-out}#vx-game-back-confirm .vx-game-back-icon{font-size:34px;margin-bottom:10px}#vx-game-back-confirm h2{font-size:20px;line-height:1.3;margin:0 0 9px;font-weight:850}#vx-game-back-confirm p{font-size:14px;line-height:1.6;color:#b9c7e3;margin:0 0 22px}#vx-game-back-confirm .vx-game-back-actions{display:grid;grid-template-columns:1fr 1fr;gap:10px}#vx-game-back-confirm button{min-height:45px;border:0;border-radius:12px;font-size:13px;font-weight:900;letter-spacing:.4px;cursor:pointer}#vx-game-back-confirm [data-vx-back=no]{background:#263653;color:#fff;border:1px solid #405578}#vx-game-back-confirm [data-vx-back=yes]{background:linear-gradient(110deg,#287df1,#8554ef);color:#fff;box-shadow:0 5px 18px #397cff44}@keyframes vxBackPop{from{opacity:0;transform:translateY(8px) scale(.97)}to{opacity:1;transform:translateY(0) scale(1)}}';
      document.head.appendChild(style);
      document.body.appendChild(dialog);
      dialog.querySelector('[data-vx-back="no"]').addEventListener('click',closeDialog);
      dialog.querySelector('[data-vx-back="yes"]').addEventListener('click',()=>{
        navigating=true;
        closeDialog();
        window.location.assign('/');
      });
      dialog.addEventListener('click',e=>{if(e.target===dialog) closeDialog();});
      keyHandler=e=>{if(e.key==='Escape'&&dialog) closeDialog();};
      document.addEventListener('keydown',keyHandler);
    };
    // Satu entri ekstra menjaga halaman game tetap aktif setelah Back pertama.
    try{history.pushState({vexelGameBackGuard:true},'',location.href);}catch(_){}
    window.addEventListener('popstate',()=>{
      if(navigating) return;
      try{history.pushState({vexelGameBackGuard:true},'',location.href);}catch(_){}
      showDialog();
    });
  }
  const token=()=>{try{return localStorage.getItem(TOKEN_KEY)||''}catch(_){return ''}};
  const esc=s=>String(s??'');
  async function request(path,options={}){
    const headers=Object.assign({},options.headers||{});
    const t=token(); if(t) headers.Authorization='Bearer '+t;
    const r=await fetch(API+path,Object.assign({},options,{headers,cache:'no-store'}));
    const d=await r.json().catch(()=>({}));
    if(!r.ok) throw new Error(d.error||'Permintaan leaderboard gagal ('+r.status+').');
    return d;
  }
  async function loadProfile(){
    if(!token()){profile=null;return null}
    const d=await request('/auth/me');
    profile=d.user||null; return profile;
  }
  function ensurePanel(){
    let panel=$('#vexel-leaderboard-panel');
    if(panel) return panel;
    panel=document.createElement('section'); panel.id='vexel-leaderboard-panel';
    panel.innerHTML='<button type="button" id="vexel-lb-toggle" aria-expanded="false">🏆 Peringkat</button><div id="vexel-lb-content" hidden><strong>LEADERBOARD</strong><div id="vexel-lb-player"></div><ol id="vexel-lb-list"><li>Memuat...</li></ol><small id="vexel-lb-status" role="status"></small></div>';
    const style=document.createElement('style');
    style.textContent='#vexel-leaderboard-panel{position:fixed;z-index:2147483000;right:10px;bottom:10px;font:13px system-ui;color:#fff}#vexel-lb-toggle{border:0;border-radius:999px;padding:10px 15px;background:#263b80;color:#fff;font-weight:800;box-shadow:0 3px 14px #0005}#vexel-lb-content{width:min(270px,calc(100vw - 24px));max-height:45vh;overflow:auto;margin-top:7px;padding:12px;border-radius:14px;background:#111a38ee;box-shadow:0 5px 25px #0006;backdrop-filter:blur(8px)}#vexel-lb-content strong{display:block;margin-bottom:6px}#vexel-lb-list{padding-left:22px;margin:8px 0}#vexel-lb-list li{padding:3px 0}#vexel-lb-status{display:block;opacity:.8}';
    document.head.appendChild(style); document.body.appendChild(panel);
    $('#vexel-lb-toggle').addEventListener('click',()=>{
      const box=$('#vexel-lb-content'),open=box.hidden;
      box.hidden=!open;$('#vexel-lb-toggle').setAttribute('aria-expanded',String(open));
      if(open) refresh();
    });
    return panel;
  }
  // PERINGKAT HANYA TERSEDIA DI LAYAR AWAL GAME SCORE.
  // Hilangkan tombol setelah game benar-benar dimulai; skor dan API tetap berjalan normal.
  function setupLeaderboardVisibility(){
    let hiddenForSession=false;
    const hide=()=>{
      if(hiddenForSession) return;
      hiddenForSession=true;
      const panel=$('#vexel-leaderboard-panel');
      if(panel){panel.hidden=true;panel.style.display='none';panel.setAttribute('aria-hidden','true');}
    };
    const startPattern=/\b(mulai(?:\s+bermain|\s+game)?|start(?:\s+game)?|play(?:\s+now)?|begin|main\s+sekarang|simpan\s*&\s*main)\b/i;
    const checkStart=e=>{
      const target=e.target&&e.target.closest?e.target.closest('button,a,[role="button"],[data-game-start]'):null;
      if(!target) return;
      const label=((target.id||'')+' '+(target.getAttribute('aria-label')||'')+' '+(target.textContent||'')).trim();
      if(target.hasAttribute('data-game-start')||/^(start|startBtn|playBtn|mulaiBtn|btnMulai)$/i.test(target.id)||startPattern.test(label)) hide();
    };
    document.addEventListener('click',checkStart,true);
    document.addEventListener('pointerdown',e=>{
      if(e.target&&e.target.closest&&e.target.closest('canvas,#stage,#board,#wrap,#g,[data-game-surface]')) hide();
    },true);
    // Game baru dapat memanggil event ini tepat saat sesi permainan dimulai.
    window.addEventListener('vexel:gamestart',hide);
    // Deteksi game yang berpindah dari layar awal (#start) ke layar bermain (#play).
    const observeScreens=()=>{
      const start=$('#start'),play=$('#play');
      if(start&&play&&start.hidden&&!play.hidden) hide();
    };
    const observer=new MutationObserver(observeScreens);
    observer.observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['hidden','class','style']});
    observeScreens();
  }
  async function refresh(){
    const list=$('#vexel-lb-list'),status=$('#vexel-lb-status'),player=$('#vexel-lb-player');
    try{
      const [board,me]=await Promise.all([
        request('/leaderboard?gameId='+encodeURIComponent(GAME_ID)),
        loadProfile().catch(()=>null)
      ]);
      if(list) list.replaceChildren();
      const rankings=(board.rankings||[]).slice(0,10);
      if(list){
        if(!rankings.length){const li=document.createElement('li');li.textContent='Belum ada skor';list.appendChild(li)}
        rankings.forEach((entry,i)=>{const li=document.createElement('li');li.textContent=(entry.playerName||'Pemain')+' — '+Number(entry.score||0).toLocaleString('id-ID');list.appendChild(li)});
      }
      if(player) player.textContent=me?'Login sebagai: '+me.nickname:'Login untuk mengirim skor.';
      if(status) status.textContent='10 skor terbaik · '+GAME_ID;
    }catch(e){if(status)status.textContent=e.message}
    // Dukungan panel bawaan game lama yang memiliki #lb dan #ms.
    const oldList=$('#lb'),oldStatus=$('#ms');
    if(oldList&&list) oldList.innerHTML=list.innerHTML;
  }
  async function submitScore(value){
    const score=Number(value);
    if(!Number.isSafeInteger(score)||score<0||score>100000000) throw new Error('Nilai skor tidak valid.');
    if(submitting) return {success:false,reason:'submitting'};
    if(lastSubmitted===score) return {success:true,duplicate:true};
    submitting=true;
    const status=$('#vexel-lb-status')||$('#ms');
    if(status)status.textContent='Memeriksa akun dan mengirim skor...';
    try{
      if(!token()) throw new Error('Silakan login ke VEXEL GAMES untuk menyimpan skor.');
      const me=await loadProfile();
      if(!me||!me.nickname) throw new Error('Nickname akun belum tersedia. Lengkapi profil pemain.');
      const result=await request('/leaderboard/submit',{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({gameId:GAME_ID,score})
      });
      lastSubmitted=score;
      if(status)status.textContent='Skor tersimpan sebagai '+result.playerName+' · rekor '+Number(result.bestScore||0).toLocaleString('id-ID');
      await refresh();
      const oldStatus=$('#ms'); if(oldStatus)oldStatus.textContent='Skor berhasil dikirim sebagai '+result.playerName+' (rekor: '+Number(result.bestScore||0).toLocaleString('id-ID')+').';
      return result;
    }catch(e){if(status)status.textContent=e.message;const oldStatus=$('#ms');if(oldStatus)oldStatus.textContent=e.message;throw e}
    finally{submitting=false}
  }
  function init(options={}){
    if(initialized) return api;
    initialized=true;
    setupBackConfirmation();
    if(options.gameId) GAME_ID=options.gameId;
    // Game non-Score diberi penanda oleh launcher VEXEL GAMES.
    // Jangan buat panel peringkat sama sekali; fitur submit skor SDK tetap tersedia.
    const hidePanel=(script&&script.dataset.hidePanel==='true') ||
      new URLSearchParams(window.location.search).get('vexelHideLeaderboard')==='1';
    if(!hidePanel){
      ensurePanel();
      setupLeaderboardVisibility();
      refresh();
    }
    return api;
  }
  const api={init,refresh,submitScore,getPlayer:loadProfile,get gameId(){return GAME_ID}};
  window.VexelLeaderboard=api;
  window.submitVexelScore=submitScore;
  window.addEventListener('vexel:gameover',e=>{
    const detail=e.detail||{};
    submitScore(detail.score).catch(()=>{});
  });
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',()=>init(),{once:true});
  else init();
})();