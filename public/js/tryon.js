(() => {
 const canvas=document.getElementById("tryon-canvas"); if(!canvas)return;
 const ctx=canvas.getContext("2d"); const upload=document.getElementById("selfie-upload");
 const width=document.getElementById("frame-width"), y=document.getElementById("frame-y"), rotate=document.getElementById("frame-rotate");
 const style=document.getElementById("frame-style"), download=document.getElementById("download-tryon");
 const placeholder=document.getElementById("tryon-placeholder"); let photo=null;
 function draw(){
   ctx.clearRect(0,0,canvas.width,canvas.height);
   if(!photo){ctx.fillStyle="#e9e2d8";ctx.fillRect(0,0,canvas.width,canvas.height);return;}
   const scale=Math.max(canvas.width/photo.width,canvas.height/photo.height);
   const w=photo.width*scale,h=photo.height*scale;
   ctx.drawImage(photo,(canvas.width-w)/2,(canvas.height-h)/2,w,h);
   const fw=Number(width.value), fh=fw*.31, cx=canvas.width/2, cy=canvas.height*.43+Number(y.value);
   ctx.save();ctx.translate(cx,cy);ctx.rotate(Number(rotate.value)*Math.PI/180);
   const stroke=style.value==="sun"?"#171717":"#292725";const fill=style.value==="sun"?"rgba(22,25,29,.58)":"rgba(245,245,240,.10)";
   ctx.lineWidth=style.value==="bold"?13:8;ctx.strokeStyle=stroke;ctx.fillStyle=fill;
   const gap=fw*.055, lensW=fw*.43, lensH=fh;
   [-1,1].forEach(side=>{const x=side*(gap/2+lensW/2);ctx.beginPath();ctx.roundRect(x-lensW/2,-lensH/2,lensW,lensH,style.value==="bold"?35:50);ctx.fill();ctx.stroke();});
   ctx.beginPath();ctx.moveTo(-gap/2,-fh*.08);ctx.quadraticCurveTo(0,-fh*.24,gap/2,-fh*.08);ctx.stroke();
   ctx.beginPath();ctx.moveTo(-fw*.49,-fh*.1);ctx.lineTo(-fw*.59,-fh*.28);ctx.moveTo(fw*.49,-fh*.1);ctx.lineTo(fw*.59,-fh*.28);ctx.stroke();
   ctx.restore();
 }
 upload.addEventListener("change",e=>{const file=e.target.files[0];if(!file)return;if(!file.type.startsWith("image/")){alert("Please select an image file.");return;}const url=URL.createObjectURL(file);photo=new Image();photo.onload=()=>{placeholder.hidden=true;download.disabled=false;draw();URL.revokeObjectURL(url);};photo.src=url;});
 [width,y,rotate,style].forEach(el=>el.addEventListener("input",draw));
 document.getElementById("reset-tryon").onclick=()=>{width.value=430;y.value=0;rotate.value=0;style.value="classic";draw();};
 download.onclick=()=>{const a=document.createElement("a");a.download="optoline-virtual-tryon.png";a.href=canvas.toDataURL("image/png");a.click();};
 draw();
})();