// LINEなどで送ったときのプレビュー画像（カードの表）を img/ に作る：node tools/make-card-images.js [card-xxx-1 ...]
const fs=require('fs'), path=require('path'), {execFileSync}=require('child_process');
const D=path.join(__dirname,'..');
const CHROME='C:/Program Files/Google/Chrome/Application/chrome.exe';
const PROFILE=path.join(require('os').tmpdir(),'yahata-card-chrome');
const only=process.argv.slice(2);
const files=fs.readdirSync(D).filter(f=>/^card-[a-z]+-\d+\.html$/.test(f)).map(f=>f.replace('.html',''))
  .filter(f=>!only.length||only.includes(f));
fs.mkdirSync(path.join(D,'img'),{recursive:true});
let ok=0;
for(const f of files){
  const out=path.join(D,'img',f+'.png');
  try{
    execFileSync(CHROME,['--headless=new','--disable-gpu','--hide-scrollbars','--user-data-dir='+PROFILE,
      '--window-size=972,685','--screenshot='+out,'file:///'+path.join(D,f+'.html').replace(/\\/g,'/')+'?og'],{timeout:40000,stdio:'ignore'});
    ok++;
  }catch(e){ console.log('NG',f); }
}
console.log('images',ok,'/',files.length);
