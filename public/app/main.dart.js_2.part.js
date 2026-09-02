((a,b)=>{a[b]=a[b]||{}})(self,"$__dart_deferred_initializers__")
$__dart_deferred_initializers__.current=function(a,b,c,$){var J,A,B,C={
bxv(d,e,f){var x=A.b([],y.l)
return new C.a5r(d,e,x,f,new C.aF3())},
VU:function VU(d,e,f){this.a=d
this.b=e
this.c=f},
agZ:function agZ(d,e,f,g,h){var _=this
_.a=d
_.b=e
_.c=f
_.d=g
_.e=h},
a5r:function a5r(d,e,f,g,h){var _=this
_.d=d
_.r=e
_.x=f
_.a=g
_.b=h
_.c=null},
aF3:function aF3(){},
lv(d){var x,w,v,u,t
if(B.p.bm(d,"#"))d=B.p.bs(d,1)
x=d.length
if(x===3)return new A.aj(1,A.dr(B.p.aA(B.p.a1(d,0,1),2),16)/255,A.dr(B.p.aA(B.p.a1(d,1,2),2),16)/255,A.dr(B.p.aA(B.p.a1(d,2,3),2),16)/255)
w=A.dr(B.p.a1(d,0,2),16)
v=A.dr(B.p.a1(d,2,4),16)
u=A.dr(B.p.a1(d,4,6),16)
t=x===8?A.dr(B.p.a1(d,6,8),16)/255:1
return new A.aj(t,w/255,v/255,u/255)},
bun(d){var x=new A.n1(d,1,B.fM)
return new A.pS(x,x,x,x)}},D
J=c[1]
A=c[0]
B=c[2]
C=a.updateHolder(c[7],C)
D=c[9]
C.VU.prototype={}
C.agZ.prototype={}
C.a5r.prototype={
VK(d,e,f,g,h){var x,w,v,u
if(this.a.grz()){x=this.gxK()
x.toString
w=d.b
w.e6()
v=new A.bh(new Float64Array(16))
v.d5()
v.uT(-1.5707963267948966)
u=x.a
v.dd(f-h+x.b-u,g+u-x.d,0,1)
w.hV(0,v)
e.dM(d)
w.iN(0)}else{x=e.a
w=x.c
x=x.d
e.a=new A.dW(f,g,w,x)
e.dM(d)}},
QI(b8,b9){var x,w,v,u,t,s,r,q,p,o,n,m,l,k,j,i,h,g,f,e,d,a0,a1,a2,a3,a4,a5,a6,a7,a8,a9,b0,b1,b2,b3,b4,b5=this,b6=null,b7=b5.gxK()
b7.toString
x=b5.a
w=x.grz()
v=w?b5.gfD().a:b5.gfD().b
u=w?b7.gcX():b7.b+b7.d
t=w?b5.gfD().b-(b7.b+b7.d):b5.gfD().a-b7.gcX()
s=new A.eL(0,t,0,1/0)
r=b7.b
q=b7.d
p=r+q
o=x.grz()?new A.eL(0,b5.gfD().b-p,0,b5.gfD().a-b7.gcX()):new A.eL(0,b5.gfD().a-b7.gcX(),0,b5.gfD().b-p)
p=x.f
n=p==null?b6:p
if(n==null)n=A.SI(b6,b6)
p=b8.a
m=A.ja(b6,b6,b6,y.t,y.C)
l=A.b([n],y.c)
k=new A.j6(b6,b6,m,p).aiK(l)
j=b5.d.$1(k)
for(m=J.a7(j),l=y.u,i=b5.x,h=b5.r,g=y.j,x=x.a,f=u-q,e=u-b7.a,b7=v-u,d=b6,a0=d,a1=a0,a2=0,a3=0;a3<m.gp(j);){a4=m.h(j,a3)
if(a1==null){a5=b5.c
a5=a5==null?b6:a5.cx
if(a5==null)a5=x
if(b9==null)a6=b6
else{a7=b9+1
a6=b9
b9=a7}a8=A.bya(p,a6,a5)
a9=a8.a1Q()
a5=a9.e
a6=new A.be("0 Tr ")
a5.cZ(a6.gp(0))
B.I.er(a5.a,a5.b,a6)
a5.b=a5.b+a6.gp(0)
a1=k.aXw(a9,a8)
a0=v-(w?f:r)
a2=w?e:q
i.push(new C.agZ(a1,s,o,a0,A.b([],g)))
b0=h.$1(a1)
b0.da(a1,s,!1)
a2+=b0.a.d}a5=l.b(a4)
if(a5&&a4.goa()){if(d!=null){a4.uS(0,d)
d=b6}b1=a4.e6().bY(0)}else b1=b6
a4.da(a1,s,!1)
b2=a5&&a4.goa()
a0.toString
a6=a4.a.d
b3=b6
if(a0-a6<a2){if(a6<=b7&&!b2){a1=b3
continue}if(!b2)throw A.d(A.cU("Widget won't fit into the page as its height ("+A.e(a6)+") exceed a page height ("+A.e(b7)+"). You probably need a SpanningWidget or use a single page layout"))
if(b1!=null)a4.e6().f9(b1)
b4=new A.eL(0,t,0,a0-a2)
a4.da(a1,b4,!1)
d=a4.e6()
B.k.gaf(i).e.push(new C.VU(a4,b4,d.bY(0)))
if(!a4.guy())++a3
a1=b3
continue}a6=B.k.gaf(i)
a5=a5&&b2?a4.e6().bY(0):b6
a6.e.push(new C.VU(a4,s,a5))
a0-=a4.a.d;++a3}},
akw(c2){var x,w,v,u,t,s,r,q,p,o,n,m,l,k,j,i,h,g,f,e,d,a0,a1,a2,a3,a4,a5,a6,a7,a8,a9,b0,b1,b2,b3,b4,b5,b6,b7,b8,b9=this,c0=null,c1=b9.gxK()
c1.toString
x=b9.a
w=x.grz()
v=w?b9.gfD().a:b9.gfD().b
if(w)b9.gfD()
else b9.gfD()
u=w?c1.gcX():c1.b+c1.d
if(!w)c1.gcX()
for(t=b9.x,s=t.length,r=c1.a,q=y.u,p=x.a,o=b9.r,x=x.d,n=x!=null,m=c1.d,c1=c1.b,l=u-m,k=u-r,j=0;j<t.length;t.length===s||(0,A.E)(t),++j){i=t[j]
h=v-(w?l:c1)
g=w?k:m
if(n){f=i.a
e=x.$1(f)
e.da(f,i.c,!1)
d=b9.c
d=d==null?c0:d.cx
b9.VK(f,e,r,m,(d==null?p:d).b)}for(f=i.e,d=f.length,a0=i.a,a1=c0,a2=0,a3=0,a4=0;a4<f.length;f.length===d||(0,A.E)(f),++a4){a5=f[a4]
e=a5.a
a6=e instanceof A.jZ?e.d:0
if(a6>0){a2+=a6
a1=e}else{if(q.b(e)&&e.goa()){a7=a5.c
a7.toString
e.e6().f9(a7)}e.da(a0,a5.b,!1)
a3+=e.a.d}}a8=o.$1(a0)
a8.da(a0,i.b,!1)
g+=a8.a.d
d=b9.c
d=d==null?c0:d.cx
b9.VK(a0,a8,r,m,(d==null?p:d).b)
a9=Math.max(0,h-g-a3)
b0=a2>0?a9/a2:0/0
for(d=f.length,b1=0,a4=0;a7=f.length,a4<a7;f.length===d||(0,A.E)(f),++a4){a5=f[a4]
e=a5.a
a7=e instanceof A.jZ
a6=a7?e.d:0
b2=a7?e.e:B.DG
if(a6>0){b3=e===a1?a9-b1:b0*a6
b4=A.cK()
switch(b2.a){case 0:b4.b=b3
break
case 1:b4.b=0
break}a7=a5.b.b
b5=b4.b
if(b5===b4)A.a0(A.lp(b4.a))
e.da(a0,new A.eL(a7,a7,b5,b3),!1)
a3+=e.a.d
b1+=b3}}for(b6=h,a4=0;a4<f.length;f.length===a7||(0,A.E)(f),++a4){a5=f[a4]
d=a5.a
b6-=d.a.d
b7=A.cK()
switch(0){case 3:case 0:b7.b=0
break}if(q.b(d)&&d.goa()){b5=a5.c
b5.toString
d.e6().f9(b5)}b5=b7.b
if(b5===b7)A.a0(A.lp(b7.a))
b8=b9.c
b8=b8==null?c0:b8.cx
if(b8==null)b8=p
b9.VK(a0,d,r+b5,b6,b8.b)}}}}
var z=a.updateTypes([])
C.aF3.prototype={
$1(d){return new A.ca(null,null,null)},
$S:916};(function inheritance(){var x=a.inheritMany,w=a.inherit
x(A.X,[C.VU,C.agZ])
w(C.a5r,A.ts)
w(C.aF3,A.m3)})()
A.am1(b.typeUniverse,JSON.parse('{"a5r":{"ts":[]}}'))
var y={C:A.ag("qi"),c:A.ag("A<qi>"),l:A.ag("A<agZ>"),j:A.ag("A<VU>"),u:A.ag("ex"),t:A.ag("jk")};(function constants(){D.SI=new A.aj(1,0.6196078431372549,0.6196078431372549,0.6196078431372549)
D.a13=new A.n1(D.SI,1,B.fM)
D.a1j=new A.pS(D.a13,B.e4,B.e4,B.e4)
D.B9=new A.E6(null,D.a1j,null)
D.ic=new A.aj(1,0.25882352941176473,0.25882352941176473,0.25882352941176473)
D.D4=new A.hV(0,10,0,0)
D.D5=new A.hV(0,10,0,4)
D.D8=new A.hV(0,5,0,0)
D.uE=new A.hV(30,30,30,30)
D.bN=new A.hV(6,6,6,6)
D.hJ=new A.hV(8,8,8,8)
D.fW=new A.it(2)
D.la=new A.it(1.2)
D.SO=new A.aj(1,0.3803921568627451,0.3803921568627451,0.3803921568627451)})()};
(a=>{a["JEvtcU0SZuA5RuoFaImPbQ0nHl0="]=a.current})($__dart_deferred_initializers__);