((a,b)=>{a[b]=a[b]||{}})(self,"$__dart_deferred_initializers__")
$__dart_deferred_initializers__.current=function(a,b,c,$){var J,A,C,B={
buX(d,e,f){var x=A.b([],y.l)
return new B.a4C(d,e,x,f,new B.aDU())},
Vt:function Vt(d,e,f){this.a=d
this.b=e
this.c=f},
afU:function afU(d,e,f,g,h){var _=this
_.a=d
_.b=e
_.c=f
_.d=g
_.e=h},
a4C:function a4C(d,e,f,g,h){var _=this
_.d=d
_.r=e
_.x=f
_.a=g
_.b=h
_.c=null},
aDU:function aDU(){},
mn(d){var x,w,v,u,t
if(C.o.bn(d,"#"))d=C.o.bq(d,1)
x=d.length
if(x===3)return new A.ah(1,A.dn(C.o.av(C.o.X(d,0,1),2),16)/255,A.dn(C.o.av(C.o.X(d,1,2),2),16)/255,A.dn(C.o.av(C.o.X(d,2,3),2),16)/255)
w=A.dn(C.o.X(d,0,2),16)
v=A.dn(C.o.X(d,2,4),16)
u=A.dn(C.o.X(d,4,6),16)
t=x===8?A.dn(C.o.X(d,6,8),16)/255:1
return new A.ah(t,w/255,v/255,u/255)},
brR(d){var x=new A.lQ(d,1,C.f9)
return new A.oc(x,x,x,x)}},D
J=c[1]
A=c[0]
C=c[2]
B=a.updateHolder(c[7],B)
D=c[9]
B.Vt.prototype={}
B.afU.prototype={}
B.a4C.prototype={
UU(d,e,f,g,h){var x,w,v,u
if(this.a.grk()){x=this.gxl()
x.toString
w=d.b
w.e2()
v=new A.bg(new Float64Array(16))
v.d3()
v.ux(-1.5707963267948966)
u=x.a
v.da(f-h+x.b-u,g+u-x.d,0,1)
w.hR(0,v)
e.dK(d)
w.iL(0)}else{x=e.a
w=x.c
x=x.d
e.a=new A.dW(f,g,w,x)
e.dK(d)}},
a0V(b8,b9){var x,w,v,u,t,s,r,q,p,o,n,m,l,k,j,i,h,g,f,e,d,a0,a1,a2,a3,a4,a5,a6,a7,a8,a9,b0,b1,b2,b3,b4,b5=this,b6=null,b7=b5.gxl()
b7.toString
x=b5.a
w=x.grk()
v=w?b5.gfv().a:b5.gfv().b
u=w?b7.gcW():b7.b+b7.d
t=w?b5.gfv().b-(b7.b+b7.d):b5.gfv().a-b7.gcW()
s=new A.eH(0,t,0,1/0)
r=b7.b
q=b7.d
p=r+q
o=x.grk()?new A.eH(0,b5.gfv().b-p,0,b5.gfv().a-b7.gcW()):new A.eH(0,b5.gfv().a-b7.gcW(),0,b5.gfv().b-p)
p=x.f
n=p==null?b6:p
if(n==null)n=A.Si(b6,b6)
p=b8.a
m=A.j3(b6,b6,b6,y.t,y.C)
l=A.b([n],y.c)
k=new A.jR(b6,b6,m,p).ahQ(l)
j=b5.d.$1(k)
for(m=J.a8(j),l=y.u,i=b5.x,h=b5.r,g=y.j,x=x.a,f=u-q,e=u-b7.a,b7=v-u,d=b6,a0=d,a1=a0,a2=0,a3=0;a3<m.gp(j);){a4=m.h(j,a3)
if(a1==null){a5=b5.c
a5=a5==null?b6:a5.cx
if(a5==null)a5=x
if(b9==null)a6=b6
else{a7=b9+1
a6=b9
b9=a7}a8=A.bvC(p,a6,a5)
a9=a8.a12()
a5=a9.e
a6=new A.ba("0 Tr ")
a5.cY(a6.gp(0))
C.I.eo(a5.a,a5.b,a6)
a5.b=a5.b+a6.gp(0)
a1=k.aWb(a9,a8)
a0=v-(w?f:r)
a2=w?e:q
i.push(new B.afU(a1,s,o,a0,A.b([],g)))
b0=h.$1(a1)
b0.d8(a1,s,!1)
a2+=b0.a.d}a5=l.b(a4)
if(a5&&a4.go_()){if(d!=null){a4.uw(0,d)
d=b6}b1=a4.e2().bX(0)}else b1=b6
a4.d8(a1,s,!1)
b2=a5&&a4.go_()
a0.toString
a6=a4.a.d
b3=b6
if(a0-a6<a2){if(a6<=b7&&!b2){a1=b3
continue}if(!b2)throw A.d(A.cS("Widget won't fit into the page as its height ("+A.e(a6)+") exceed a page height ("+A.e(b7)+"). You probably need a SpanningWidget or use a single page layout"))
if(b1!=null)a4.e2().f5(b1)
b4=new A.eH(0,t,0,a0-a2)
a4.d8(a1,b4,!1)
d=a4.e2()
C.l.gad(i).e.push(new B.Vt(a4,b4,d.bX(0)))
if(!a4.guc())++a3
a1=b3
continue}a6=C.l.gad(i)
a5=a5&&b2?a4.e2().bX(0):b6
a6.e.push(new B.Vt(a4,s,a5))
a0-=a4.a.d;++a3}},
ajG(c2){var x,w,v,u,t,s,r,q,p,o,n,m,l,k,j,i,h,g,f,e,d,a0,a1,a2,a3,a4,a5,a6,a7,a8,a9,b0,b1,b2,b3,b4,b5,b6,b7,b8,b9=this,c0=null,c1=b9.gxl()
c1.toString
x=b9.a
w=x.grk()
v=w?b9.gfv().a:b9.gfv().b
if(w)b9.gfv()
else b9.gfv()
u=w?c1.gcW():c1.b+c1.d
if(!w)c1.gcW()
for(t=b9.x,s=t.length,r=c1.a,q=y.u,p=x.a,o=b9.r,x=x.d,n=x!=null,m=c1.d,c1=c1.b,l=u-m,k=u-r,j=0;j<t.length;t.length===s||(0,A.E)(t),++j){i=t[j]
h=v-(w?l:c1)
g=w?k:m
if(n){f=i.a
e=x.$1(f)
e.d8(f,i.c,!1)
d=b9.c
d=d==null?c0:d.cx
b9.UU(f,e,r,m,(d==null?p:d).b)}for(f=i.e,d=f.length,a0=i.a,a1=c0,a2=0,a3=0,a4=0;a4<f.length;f.length===d||(0,A.E)(f),++a4){a5=f[a4]
e=a5.a
a6=e instanceof A.jU?e.d:0
if(a6>0){a2+=a6
a1=e}else{if(q.b(e)&&e.go_()){a7=a5.c
a7.toString
e.e2().f5(a7)}e.d8(a0,a5.b,!1)
a3+=e.a.d}}a8=o.$1(a0)
a8.d8(a0,i.b,!1)
g+=a8.a.d
d=b9.c
d=d==null?c0:d.cx
b9.UU(a0,a8,r,m,(d==null?p:d).b)
a9=Math.max(0,h-g-a3)
b0=a2>0?a9/a2:0/0
for(d=f.length,b1=0,a4=0;a7=f.length,a4<a7;f.length===d||(0,A.E)(f),++a4){a5=f[a4]
e=a5.a
a7=e instanceof A.jU
a6=a7?e.d:0
b2=a7?e.e:C.Di
if(a6>0){b3=e===a1?a9-b1:b0*a6
b4=A.cJ()
switch(b2.a){case 0:b4.b=b3
break
case 1:b4.b=0
break}a7=a5.b.b
b5=b4.b
if(b5===b4)A.a_(A.ld(b4.a))
e.d8(a0,new A.eH(a7,a7,b5,b3),!1)
a3+=e.a.d
b1+=b3}}for(b6=h,a4=0;a4<f.length;f.length===a7||(0,A.E)(f),++a4){a5=f[a4]
d=a5.a
b6-=d.a.d
b7=A.cJ()
switch(0){case 3:case 0:b7.b=0
break}if(q.b(d)&&d.go_()){b5=a5.c
b5.toString
d.e2().f5(b5)}b5=b7.b
if(b5===b7)A.a_(A.ld(b7.a))
b8=b9.c
b8=b8==null?c0:b8.cx
if(b8==null)b8=p
b9.UU(a0,d,r+b5,b6,b8.b)}}}}
var z=a.updateTypes([])
B.aDU.prototype={
$1(d){return new A.cr(null,null,null)},
$S:908};(function inheritance(){var x=a.inheritMany,w=a.inherit
x(A.X,[B.Vt,B.afU])
w(B.a4C,A.Ar)
w(B.aDU,A.lX)})()
A.akW(b.typeUniverse,JSON.parse('{"a4C":{"Ar":[]}}'))
var y={C:A.ac("q4"),c:A.ac("A<q4>"),l:A.ac("A<afU>"),j:A.ac("A<Vt>"),u:A.ac("es"),t:A.ac("jc")};(function constants(){D.xR=new A.ah(1,0.6196078431372549,0.6196078431372549,0.6196078431372549)
D.jB=new A.ah(1,0.25882352941176473,0.25882352941176473,0.25882352941176473)
D.nz=new A.dc(8,8,8,8)
D.lQ=new A.ah(1,0.3803921568627451,0.3803921568627451,0.3803921568627451)})()};
(a=>{a["0nnQSlWjEIqrooRBMKL+xMIg/KQ="]=a.current})($__dart_deferred_initializers__);