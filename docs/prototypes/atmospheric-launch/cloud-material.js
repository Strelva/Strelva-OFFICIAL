/* Original cloud shader. The separate moving radial-gradient layer is adapted
 * from Aceternity's MIT Background Gradient Animation, found through 21st.dev.
 * See README.md for source, attribution and the intentionally rejected examples.
 */
(() => {
  const vertex = `attribute vec2 a_position;void main(){gl_Position=vec4(a_position,0.,1.);}`;
  const fragment = `
precision mediump float;
uniform vec2 u_size;
uniform float u_time;
uniform float u_variant;
uniform float u_light;
float hash(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);vec2 s=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),s.x),mix(hash(i+vec2(0.,1.)),hash(i+1.),s.x),s.y);}
float cloud(vec2 p){float n=0.;float a=.5;mat2 r=mat2(.8,-.6,.6,.8);for(int i=0;i<5;i++){n+=a*noise(p);p=r*p*2.03+vec2(7.2,3.8);a*=.5;}return n;}
void main(){
 vec2 uv=gl_FragCoord.xy/u_size;uv.y=1.-uv.y;
 vec2 p=vec2(uv.x*u_size.x/u_size.y,uv.y)*3.;
 p+=vec2(u_variant*7.3,u_variant*2.1);
 float t=u_time*.028;
 vec2 warp=vec2(cloud(p*.8+vec2(t,-t*.3)),cloud(p*.8+vec2(8.4,-t*.4)));
 float billow=cloud(p*2.1+warp*2.4+vec2(t*.5,0.));
 float detail=cloud(p*6.2+warp*1.5-vec2(t*.3,t*.2));
 float path=uv.y-.36-uv.x*.26;
 if(u_variant>.5&&u_variant<1.5)path=uv.y-.61;
 if(u_variant>1.5&&u_variant<2.5)path=uv.y-.54+sin(uv.x*3.)*.1;
 if(u_variant>2.5&&u_variant<3.5)path=uv.y-.43-sin(uv.x*4.)*.13;
 if(u_variant>3.5&&u_variant<4.5)path=length((uv-vec2(.48,.4))*vec2(1.,1.2))-.05;
 if(u_variant>4.5)path=uv.y-.54+uv.x*.16;
 float width=.15;if(u_variant>1.5&&u_variant<2.5)width=.28;if(u_variant>2.5&&u_variant<3.5)width=.095;if(u_variant>4.5)width=.35;
 float uneven=path+(billow-.5)*.48+(detail-.5)*.10;
 float opening=exp(-pow(uneven/width,2.));
 float pigment=clamp(opening*.85+(billow-.35)*.4,0.,1.);
 vec3 deep=mix(vec3(.035,.075,.135),vec3(.31,.41,.49),u_light);
 vec3 slate=mix(vec3(.19,.29,.35),vec3(.64,.72,.72),u_light);
 vec3 moss=mix(vec3(.42,.52,.32),vec3(.70,.76,.57),u_light);
 vec3 sage=mix(vec3(.72,.77,.46),vec3(.93,.95,.77),u_light);
 if(u_variant>4.5){moss=mix(vec3(.30,.45,.47),vec3(.64,.76,.75),u_light);sage=mix(vec3(.64,.74,.68),vec3(.90,.96,.90),u_light);}
 vec3 color=mix(deep,slate,smoothstep(.18,.8,billow));
 color=mix(color,moss,smoothstep(.13,.75,pigment));
 color=mix(color,sage,smoothstep(.65,1.,pigment)*(.65+detail*.35));
 float shadow=cloud(p*3.+warp*3.+vec2(t*.2,12.));
 color*=.78+shadow*.38;

 // Daylight uses a pale ground with broad pigment washes, not lit dark clouds.
 if(u_light>.5){
   vec3 paper=vec3(.83,.85,.83);
   vec3 mineral=vec3(.65,.79,.85);
   vec3 botanical=vec3(.77,.84,.65);
   if(u_variant>.5&&u_variant<1.5){mineral=vec3(.69,.79,.91);botanical=vec3(.85,.88,.85);}
   if(u_variant>1.5&&u_variant<2.5){mineral=vec3(.80,.76,.86);botanical=vec3(.90,.83,.72);}
   if(u_variant>2.5&&u_variant<3.5){mineral=vec3(.61,.80,.81);botanical=vec3(.79,.87,.76);}
   if(u_variant>3.5&&u_variant<4.5){mineral=vec3(.85,.81,.72);botanical=vec3(.92,.89,.72);}
   if(u_variant>4.5){mineral=vec3(.72,.81,.88);botanical=vec3(.86,.91,.90);}
   float wash=smoothstep(.22,.78,cloud(p*.65+warp*.45+vec2(t*.2,0.)));
   color=mix(paper,mineral,wash*.30);
   color=mix(color,botanical,smoothstep(.15,.9,wash)*.18);
   color=mix(color,paper,smoothstep(.45,1.,1.-uv.y)*.15);
 }
 float granule=(hash(gl_FragCoord.xy)-.5)*.026;
 color+=granule*mix(1.,.2,u_light);
 // Reference-led material: two broken pigment banks around a quiet ink center.
 if(u_variant>5.5){
   vec2 q=vec2(uv.x*u_size.x/u_size.y,uv.y)*3.8;
   vec2 drift=vec2(t*.10,-t*.06);
   vec2 w=vec2(cloud(q+drift),cloud(q+vec2(4.3,7.1)-drift));
   float folds=cloud(q*2.6+w*2.1);
   float dust=cloud(q*12.+w*2.);
   float upper=uv.y-.10-uv.x*.66+(folds-.5)*.23;
   float lower=uv.y-1.10+uv.x*.56+(folds-.5)*.25;
   float banks=exp(-pow(upper/.16,2.))*.72+exp(-pow(lower/.13,2.))*.82;
   float torn=smoothstep(.20,.76,folds)*(.25+dust*.85);
   float pigment=clamp(banks*torn,0.,1.);
   color=vec3(.018,.037,.045);
   color=mix(color,vec3(.10,.22,.23),smoothstep(.04,.55,pigment)*.7);
   float mineral=smoothstep(.20,.7,pigment)*(.45+.55*cloud(q*.7+vec2(9.)));
   color=mix(color,vec3(.48,.49,.33),mineral*(.28+dust*.8));
   float fleck=pow(cloud(q*28.+w*3.),3.);
   color+=vec3(.15,.18,.12)*fleck*banks;
   float center=exp(-pow(length((uv-vec2(.53,.48))*vec2(1.,1.2))/.27,2.));
   color*=1.-center*.5;
   color+=(hash(gl_FragCoord.xy)-.5)*.035*(.3+pigment);
 }
 gl_FragColor=vec4(color,1.);
}`;
  const root=document.documentElement;
  const media=matchMedia('(prefers-reduced-motion: reduce)');
  const scenes=[];
  let raf=0,last=0,suspended=false;
  function create(canvas){
    const gl=canvas.getContext('webgl',{alpha:false,antialias:false,powerPreference:'low-power'});
    if(!gl){canvas.dataset.renderer='fallback';return;}
    const resources=[];
    function compile(type,source){const shader=gl.createShader(type);gl.shaderSource(shader,source);gl.compileShader(shader);if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS)){throw new Error(gl.getShaderInfoLog(shader));}resources.push(shader);return shader;}
    try{
      const program=gl.createProgram();gl.attachShader(program,compile(gl.VERTEX_SHADER,vertex));gl.attachShader(program,compile(gl.FRAGMENT_SHADER,fragment));gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(program));
      gl.useProgram(program);const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);
      const position=gl.getAttribLocation(program,'a_position');gl.enableVertexAttribArray(position);gl.vertexAttribPointer(position,2,gl.FLOAT,false,0,0);
      const scene={canvas,gl,program,buffer,resources,visible:false,time:0,lost:false,draws:0,width:1,height:1,dirty:true,locations:Object.fromEntries(['u_size','u_time','u_variant','u_light'].map(name=>[name,gl.getUniformLocation(program,name)]))};
      scenes.push(scene);canvas.dataset.renderer='webgl';canvas.style.visibility='hidden';
      canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();scene.lost=true;canvas.style.visibility='hidden';});
      canvas.addEventListener('webglcontextrestored',()=>location.reload());
    }catch(error){canvas.dataset.renderer='fallback';console.warn('Cloud material fallback:',error.message);resources.forEach(shader=>gl.deleteShader(shader));canvas.style.visibility='hidden';}
  }
  function draw(scene){
    if(scene.lost||scene.width<=1||scene.height<=1)return;
    const {canvas,gl,locations:l,width,height}=scene;
    if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;gl.viewport(0,0,width,height);}
    gl.uniform2f(l.u_size,width,height);gl.uniform1f(l.u_time,scene.time+Number(canvas.dataset.variant)*11);gl.uniform1f(l.u_variant,Number(canvas.dataset.variant));gl.uniform1f(l.u_light,root.dataset.theme==='light'?1:0);gl.drawArrays(gl.TRIANGLES,0,6);scene.draws++;scene.dirty=false;canvas.style.visibility='visible';
  }
  function canAnimate(){return !suspended&&root.dataset.paused!=='true'&&!media.matches&&!document.hidden;}
  function frame(now){raf=0;const elapsed=last?Math.min((now-last)/1000,.1):0;if(!last||now-last>=1000/24){last=now;scenes.filter(s=>s.visible&&!s.lost).forEach(s=>{s.time+=elapsed;draw(s);});}if(canAnimate()&&scenes.some(s=>s.visible&&!s.lost))raf=requestAnimationFrame(frame);}
  function sync(){if(suspended)return;if(raf)cancelAnimationFrame(raf);raf=0;last=0;scenes.filter(s=>s.visible||s.dirty).forEach(draw);if(canAnimate()&&scenes.some(s=>s.visible&&!s.lost))raf=requestAnimationFrame(frame);}
  document.querySelectorAll('.canvas-material').forEach(create);
  const observer=new IntersectionObserver(entries=>{for(const entry of entries){const scene=scenes.find(s=>s.canvas===entry.target);if(scene)scene.visible=entry.isIntersecting;}sync();});scenes.forEach(scene=>observer.observe(scene.canvas));
  const resize=new ResizeObserver(entries=>{
    for(const entry of entries){
      const scene=scenes.find(item=>item.canvas===entry.target);
      if(!scene)continue;
      const {width,height}=entry.contentRect;
      // Cache CSS dimensions only when layout changes, never in the animation loop.
      const ratio=Math.min(devicePixelRatio,1,640/Math.max(width,height,1));
      scene.width=Math.max(1,Math.round(width*ratio));
      scene.height=Math.max(1,Math.round(height*ratio));scene.dirty=true;
    }
    sync();
  });scenes.forEach(scene=>resize.observe(scene.canvas));
  const mutations=new MutationObserver(entries=>{if(entries.some(entry=>entry.attributeName==='data-theme'))scenes.forEach(scene=>scene.dirty=true);sync();});mutations.observe(root,{attributes:true,attributeFilter:['data-theme','data-paused']});
  media.addEventListener('change',sync);document.addEventListener('visibilitychange',sync);
  window.materialDiagnostics=()=>scenes.map(s=>({variant:Number(s.canvas.dataset.variant),renderer:s.canvas.dataset.renderer,visible:s.visible,frames:s.draws,time:s.time,width:s.canvas.width,height:s.canvas.height,error:s.gl.getError()}));
  window.addEventListener('pagehide',event=>{
    suspended=true;cancelAnimationFrame(raf);raf=0;
    // A persisted page retains live contexts and observers for its bfcache return.
    if(event.persisted)return;
    observer.disconnect();resize.disconnect();mutations.disconnect();
    media.removeEventListener('change',sync);document.removeEventListener('visibilitychange',sync);
    scenes.forEach(s=>{s.gl.deleteBuffer(s.buffer);s.gl.deleteProgram(s.program);s.resources.forEach(shader=>s.gl.deleteShader(shader));});
  });
  window.addEventListener('pageshow',event=>{if(event.persisted){suspended=false;sync();}});
})();
