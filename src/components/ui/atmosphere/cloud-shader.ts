// Adapted from Strelva’s original cloud study, docs/prototypes/atmospheric-launch/cloud-material.js.
// Domain-warped noise supplies the material; DOM content stays above it.
export const cloudVertexShader = `attribute vec2 a_position;void main(){gl_Position=vec4(a_position,0.,1.);}`;
export const cloudFragmentShader = `
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
 gl_FragColor=vec4(color,1.);
}`;
