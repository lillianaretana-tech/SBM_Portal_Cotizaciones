/* V29 - Lectura sin modificar ni almacenar el XLSX original */
(function(root){
'use strict';
const NS='http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const RNS='http://schemas.openxmlformats.org/officeDocument/2006/relationships';
function xml(s){const d=new DOMParser().parseFromString(s,'application/xml');if(d.querySelector('parsererror'))throw Error('XML Excel inválido');return d}
function tags(e,n){return [...e.getElementsByTagNameNS(NS,n)]}
function numeric(x){const n=Number(String(x??'').replace(/,/g,''));return Number.isFinite(n)?n:0}
async function read(file){
if(!root.JSZip)throw Error('JSZip no está disponible');
const z=await root.JSZip.loadAsync(file),get=async p=>{const f=z.file(p);if(!f)throw Error('Falta '+p);return xml(await f.async('string'))};
const book=await get('xl/workbook.xml'),rels=await get('xl/_rels/workbook.xml.rels');
const relation={};for(const r of [...rels.getElementsByTagName('*')])if(r.localName==='Relationship')relation[r.getAttribute('Id')]=r.getAttribute('Target');
const sf=z.file('xl/sharedStrings.xml'),strings=sf?tags(xml(await sf.async('string')),'si').map(e=>tags(e,'t').map(t=>t.textContent).join('')):[];
const sheets={};
for(const sh of tags(book,'sheet')){
const name=sh.getAttribute('name'),rid=sh.getAttributeNS(RNS,'id')||sh.getAttribute('r:id');let path=relation[rid];
if(!path)continue;
path=path.replace(/^\/+/,'');if(!path.startsWith('xl/'))path='xl/'+path;
const part=await get(path),cells={};
for(const c of tags(part,'c')){
const t=c.getAttribute('t'),raw=tags(c,'v')[0]?.textContent??'';
cells[c.getAttribute('r')]=t==='s'?strings[Number(raw)]??'':t==='inlineStr'?tags(c,'t').map(e=>e.textContent).join(''):raw;
}
sheets[name]=cells;
}
const name=Object.keys(sheets).find(x=>x.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()==='calculos');
if(!name)throw Error('No existe la hoja Cálculos');
const c=sheets[name],v=k=>String(c[k]??'').trim(),n=k=>numeric(c[k]);
const laborMode=Object.keys(sheets).some(x=>x.toLowerCase()==='sbm'),formato=laborMode?'COM-F-04':'COM-F-06';
function lines(first,last,clase){const result=[];for(let row=first;row<=last;row++){const desc=v('D'+row),qty=n('H'+row),price=n('J'+row);if(desc&&qty>0&&price>0)result.push({orden:result.length+1,clase,descripcion:desc,cantidad:qty,precio_unitario:price,subtotal:qty*price,fila_origen:row})}return result}
const materials=lines(laborMode?32:14,laborMode?45:43,'suministro');
const labor=laborMode?lines(14,29,'mano_obra').map(x=>({...x,horas_totales:x.cantidad})):[];
const overhead=laborMode?lines(48,58,'otro'):[];
const serial=n('D7'),fecha=serial>30000&&serial<100000?new Date(Date.UTC(1899,11,30)+serial*86400000).toISOString().slice(0,10):'';
const resumen=Object.keys(sheets).find(x=>x.toLowerCase().includes('cotizaci')&&x.toLowerCase().includes('resumen')&&!x.includes('
const precio_cliente=laborMode?numeric(sheets[resumen]?.O20):n('M46');
return {formato,numero:v('O11'),fecha,cliente:v('D8'),direccion:v('D9'),proyecto:v('D10'),descripcion:v('I7'),observaciones:v(laborMode?'D66':'D53'),emisor:n('F3'),materials,labor,overhead,
subtotal_calculado:[...materials,...labor,...overhead].reduce((sum,x)=>sum+x.subtotal,0),
costo_interno:n(laborMode?'M60':'M44'),precio_cliente,administracion:laborMode?0:n('M45'),total_original:laborMode?precio_cliente:n('M48'),iva:laborMode?0:n('M47'),
advertencias:['Los valores calculados son una lectura del caché de Excel: verificar el resultado al regenerar',...(laborMode?['El precio comercial incluye cargos que no están reflejados en el costo directo de mano de obra']:[])]};
}
root.SBMV29Parser={read};
})(window);
));
const precio_cliente=laborMode?numeric(sheets[resumen]?.O20):n('M46');
return {formato,numero:v('O11'),fecha,cliente:v('D8'),direccion:v('D9'),proyecto:v('D10'),descripcion:v('I7'),observaciones:v(laborMode?'D66':'D53'),emisor:n('F3'),materials,labor,overhead,
subtotal_calculado:[...materials,...labor,...overhead].reduce((sum,x)=>sum+x.subtotal,0),
costo_interno:n(laborMode?'M60':'M44'),precio_cliente,administracion:laborMode?0:n('M45'),total_original:laborMode?precio_cliente:n('M48'),iva:laborMode?0:n('M47'),
advertencias:['Los valores calculados son una lectura del caché de Excel: verificar el resultado al regenerar','El detalle de mano de obra COM-F-04 puede requerir información adicional sobre jornada y puesto']};
}
root.SBMV29Parser={read};
})(window);
