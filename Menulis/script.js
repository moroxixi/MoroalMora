
// isi dengan URL Web App /exec setelah deploy
var ENDPOINT='https://script.google.com/macros/s/AKfycbxCydpQaAoUNsBDDAOOTZwfJ0f8kvrU_PtmYGt4Rx4LYEWzqO5TFT6JNuJgr6tvCi8n/exec';
(function(){
  var F=['q','dugaan','dukung','runtuh','simpul','next'];
  var REQ={q:'Pertanyaan',dugaan:'Dugaan awal',simpul:'Kesimpulan sementara'};
  var K={e:'hh:entries',d:'hh:draft',n:'hh:next'};
  var st=document.getElementById('st'),tag=document.getElementById('tag');
  function get(k,def){try{var v=localStorage.getItem(k);return v===null?def:JSON.parse(v)}catch(e){return def}}
  function put(k,v){try{localStorage.setItem(k,JSON.stringify(v));return true}catch(e){return false}}
  function del(k){try{localStorage.removeItem(k)}catch(e){}}
  function sget(k,def){try{var v=sessionStorage.getItem(k);return v===null?def:JSON.parse(v)}catch(e){return def}}
  function sput(k,v){try{sessionStorage.setItem(k,JSON.stringify(v));return true}catch(e){return false}}
  function sdel(k){try{sessionStorage.removeItem(k)}catch(e){}}
  function el(id){return document.getElementById(id)}
  function grow(t){t.style.height='auto';t.style.height=Math.max(72,t.scrollHeight+2)+'px'}
  function msg(t,err){st.textContent=t;st.className=err?'err':''}

  var d=new Date(),pad=function(n){return String(n).padStart(2,'0')};
  var iso=d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
  el('tgl').textContent=d.toLocaleDateString('id-ID',{weekday:'long',day:'numeric',month:'long',year:'numeric'});

  function refreshTags(){
    var seen={};get(K.e,[]).forEach(function(x){if(x.tag)seen[x.tag]=1});
    el('tags').innerHTML='';
    Object.keys(seen).forEach(function(t){var o=document.createElement('option');o.value=t;el('tags').appendChild(o)});
  }
  function fill(o){F.forEach(function(f){el(f).value=o[f]||'';grow(el(f))});tag.value=o.tag||tag.value||''}
  function read(){var o={tag:tag.value.trim()};F.forEach(function(f){o[f]=el(f).value.trim()});return o}

  var draft=sget(K.d,null);
  if(draft){fill(draft);msg('Draf terakhir dipulihkan.')}
  else{var nx=get(K.n,'');if(nx){el('q').value=nx;grow(el('q'));msg('Pertanyaan ini dari halaman terakhirmu.')}}
  var ents=get(K.e,[]);
  if(ents.length&&!tag.value)tag.value=ents[ents.length-1].tag||'';
  refreshTags();

  F.forEach(function(f){el(f).addEventListener('input',function(){grow(this);sput(K.d,read())})});
  tag.addEventListener('input',function(){sput(K.d,read())});

  el('save').addEventListener('click',function(){
    var btn=el('save');
    var o=read(),miss=[];
    if(!o.tag)miss.push('Tag');
    Object.keys(REQ).forEach(function(k){if(!o[k])miss.push(REQ[k])});
    if(miss.length){msg('Isi dulu: '+miss.join(', ')+'.',true);return}
    if(!ENDPOINT){msg('Endpoint belum diatur',true);return}
    o.date=iso;o.saved=Date.now();
    sput(K.d,read());
    btn.disabled=true;
    msg('Menyimpan...');
    fetch(ENDPOINT,{
      method:'POST',
      headers:{'Content-Type':'text/plain;charset=utf-8'},
      body:JSON.stringify({tag:o.tag,q:o.q,dugaan:o.dugaan,dukung:o.dukung,runtuh:o.runtuh,simpul:o.simpul,next:o.next,date:o.date})
    }).then(function(r){return r.json()})
      .then(function(res){
        if(res&&res.ok){
          var all=get(K.e,[]);all.push(o);
          if(!put(K.e,all)){msg('Gagal menyimpan. Penyimpanan browser mungkin dinonaktifkan.',true);return}
          put(K.n,o.next);sdel(K.d);
          F.forEach(function(f){el(f).value=''});
          el('q').value=o.next;F.forEach(function(f){grow(el(f))});
          refreshTags();
          msg('Halaman tersimpan. Total '+all.length+' halaman.');
          window.scrollTo(0,0);
        }else{
          msg('Gagal menyimpan: '+((res&&res.error)||'respons server tidak dikenal'),true);
        }
      })
      .catch(function(){msg('Gagal menyimpan. Periksa jaringan, lalu coba lagi.',true)})
      .then(function(){btn.disabled=false});
  });
})();

/* ==========================================================================
 *  Panel "Daftar Pertanyaan" - IIFE terpisah supaya kegagalan panel tidak
 *  memengaruhi form harian di atas.
 * ========================================================================== */
(function(){
  var PK='hh:dp';        // status minimize panel (sessionStorage)
  var MAX=1000;          // batas karakter, sama dengan server
  var panel=document.getElementById('dp-panel');
  var toggle=document.getElementById('dp-toggle');
  var input=document.getElementById('dp-input');
  var addBtn=document.getElementById('dp-add');
  var status=document.getElementById('dp-status');
  var list=document.getElementById('dp-list');
  var empty=document.getElementById('dp-empty');

  function sget(k,def){try{var v=sessionStorage.getItem(k);return v===null?def:JSON.parse(v)}catch(e){return def}}
  function sput(k,v){try{sessionStorage.setItem(k,JSON.stringify(v));return true}catch(e){return false}}
  function show(t,err){status.textContent=t;status.className=err?'dp-status err':'dp-status'}
  function setEmpty(n){empty.hidden=n>0}
  function post(payload){
    return fetch(ENDPOINT,{
      method:'POST',
      headers:{'Content-Type':'text/plain;charset=utf-8'},
      body:JSON.stringify(payload)
    }).then(function(r){return r.json()});
  }

  function itemNode(it){
    var li=document.createElement('li');
    li.className='dp-item';
    li.setAttribute('data-id',it.id||'');
    var tx=document.createElement('span');
    tx.className='dp-text';
    tx.textContent=it.text||'';
    var acts=document.createElement('div');
    acts.className='dp-acts';
    var bs=document.createElement('button');
    bs.type='button';bs.className='dp-salin';bs.textContent='Salin';
    var bh=document.createElement('button');
    bh.type='button';bh.className='dp-hapus';bh.textContent='Hapus';
    acts.appendChild(bs);
    acts.appendChild(bh);
    li.appendChild(tx);
    li.appendChild(acts);
    return li;
  }

  function salinTeks(t){
    if(navigator.clipboard&&navigator.clipboard.writeText){
      return navigator.clipboard.writeText(t);
    }
    return new Promise(function(res,rej){
      try{
        var ta=document.createElement('textarea');
        ta.value=t;
        ta.setAttribute('readonly','');
        ta.style.position='fixed';
        ta.style.top='-1000px';
        document.body.appendChild(ta);
        ta.select();
        var ok=document.execCommand('copy');
        document.body.removeChild(ta);
        if(ok)res();else rej(new Error('execCommand copy gagal'));
      }catch(err){rej(err)}
    });
  }

  function onSalin(btn,li){
    var tx=li.querySelector('.dp-text');
    var teks=tx?tx.textContent:'';
    if(!teks)return;
    salinTeks(teks).then(function(){
      btn.textContent='Tersalin';
      setTimeout(function(){btn.textContent='Salin'},1500);
    }).catch(function(){
      show('Gagal menyalin. Salin manual teksnya.',true);
    });
  }

  function onHapus(btn,li){
    var id=li.getAttribute('data-id');
    if(!id)return;
    if(!window.confirm('Hapus pertanyaan ini?'))return;
    btn.disabled=true;
    post({action:'hapus',id:id})
      .then(function(res){
        if(res&&res.ok){
          if(li.parentNode)li.parentNode.removeChild(li);
          show('');
          setEmpty(list.children.length);
        }else{
          btn.disabled=false;
          show('Gagal menghapus: '+((res&&res.error)||'respons server tidak dikenal'),true);
        }
      })
      .catch(function(){
        btn.disabled=false;
        show('Gagal menghapus. Periksa jaringan, lalu coba lagi.',true);
      });
  }

  function tambah(){
    if(addBtn.disabled)return;
    var teks=(input.value||'').replace(/^\s+|\s+$/g,'');
    if(!teks){show('Tulis pertanyaan dulu.',true);input.focus();return}
    if(teks.length>MAX){show('Pertanyaan maksimal '+MAX+' karakter.',true);return}
    if(!ENDPOINT){show('Endpoint belum diatur',true);return}
    addBtn.disabled=true;
    show('Menyimpan...');
    post({action:'tambah',pertanyaan:teks})
      .then(function(res){
        if(res&&res.ok&&res.item){
          input.value='';
          list.appendChild(itemNode(res.item));
          show('');
          setEmpty(list.children.length);
        }else{
          show('Gagal menambah: '+((res&&res.error)||'respons server tidak dikenal'),true);
        }
      })
      .catch(function(){show('Gagal menghubungi server. Periksa jaringan, lalu coba lagi.',true)})
      .then(function(){addBtn.disabled=false});
  }

  function muat(){
    empty.hidden=true;
    show('Memuat daftar...');
    post({action:'daftar'})
      .then(function(res){
        if(res&&res.ok&&res.items){
          while(list.firstChild)list.removeChild(list.firstChild);
          for(var i=0;i<res.items.length;i++)list.appendChild(itemNode(res.items[i]));
          show('');
          setEmpty(res.items.length);
        }else{
          show('Gagal memuat: '+((res&&res.error)||'respons server tidak dikenal'),true);
        }
      })
      .catch(function(){show('Gagal memuat daftar. Periksa jaringan, lalu muat ulang halaman.',true)});
  }

  function applyMin(min){
    if(min){panel.classList.add('min')}else{panel.classList.remove('min')}
    toggle.setAttribute('aria-expanded',min?'false':'true');
    toggle.textContent=min?'+':'\u2212';
    toggle.setAttribute('aria-label',min?'Perluas panel Daftar Pertanyaan':'Minimalkan panel Daftar Pertanyaan');
    sput(PK,min);
  }

  try{
    if(!panel||!toggle||!input||!addBtn||!status||!list||!empty)return;
    applyMin(sget(PK,false)===true);
    toggle.addEventListener('click',function(){applyMin(!panel.classList.contains('min'))});
    addBtn.addEventListener('click',tambah);
    input.addEventListener('keydown',function(ev){
      if(ev.key==='Enter'||ev.keyCode===13){ev.preventDefault();tambah()}
    });
    list.addEventListener('click',function(ev){
      var t=ev.target;
      while(t&&t!==list&&t.tagName!=='BUTTON')t=t.parentNode;
      if(!t||t===list||t.tagName!=='BUTTON')return;
      var li=t.parentNode&&t.parentNode.parentNode;
      if(!li||li.tagName!=='LI')return;
      if(t.className==='dp-salin')onSalin(t,li);
      else if(t.className==='dp-hapus')onHapus(t,li);
    });
    muat();
  }catch(err){
    if(typeof console!=='undefined'&&console.error)console.error('panel daftar pertanyaan: '+err);
  }
})();
