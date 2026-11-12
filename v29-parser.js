/* V29: lector XLSX estructurado. No escribe registros oficiales. */
(function(root){
'use strict';
const NS='http://schemas.openxmlformats.org/spreadsheetml/2006/main';
function parseXML(xml){const d=new DOMParser().parseFromString(xml,'application/xml');if(d.querySelector('parsererror'))throw Error('XML inválido');return d}
function tags(node,name){return Array.from(node.getElementsByTagNameNS(NS,name))}
function number(x){const n=Number(String(x??'').replace(/,/g,''));return Number.isFinite(n)?n:0}
function excelDate(x){const n=number(x);return n>30000&&n<100000?new Date(Date.UTC(1899,11,30)+n*86400000).toISOString().slice(0,10):''}
async function read(file){
if(!root.JSZip)throw Error('JSZip no disponible');
const zip=await root.JSZip.loadAsync(file),workbook=zip.file('xl/workbook.xml');if(!workbook)throw Error('Libro XLSX inválido');
const doc=parseXML(await workbook.async('string'));
const relDoc=parseXML(await zip.file('xl/_rels/workbook.xml.rels').async('string'));
const rels={};for(const e of Array.from(relDoc.getElementsByTagName('*')))if(e.localName==='Relationship')rels[e.getAttribute('Id')]=e.getAttribute('Target');
const sharedFile=zip.file('xl/sharedStrings.xml');
const shared=sharedFile?tags(parseXML(await sharedFile.async('string')),'si').map(x=>tags(x,'t').map(t=>t.textContent).join('')):[];
const sheets={};
for(const s of tags(doc,'sheet')){
const name=s.getAttribute('name'),rid=s.getAttribute('r:id')||s.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships','id');
let target=rels[rid];if(!target)continue;
target=target.replace(/^\//,'').replace(/^xl\//,'');
const path=target.startsWith('worksheets/')?'xl/'+target:target;
const part=zip.file(path);if(!part)throw Error('Falta hoja '+name);
const sd=parseXML(await part.async('string')),cells={};
for(const c of tags(sd,'c')){
const ref=c.getAttribute('r'),type=c.getAttribute('t'),v=tags(c,'v')[0]?.textContent??'';
cells[ref]=type==='s'?shared[Number(v)]??'':type==='inlineStr'?tags(c,'t').map(t=>t.textContent).join(''):v;
}
sheets[name]=cells;
}
const calcName=Object.keys(sheets).find(x=>x.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()==='calculos');
if(!calcName)throw Error('No existe hoja Cálculos');
const c=sheets[calcName],v=k=>String(c[k]??'').trim(),n=k=>number(c[k]);
const type=Object.keys(sheets).some(x=>x.toLowerCase()==='sbm')?'COM-F-04':'COM-F-06';
const start=type==='COM-F-04'?32:14;\nconst end=type==='COM-F-04'?42:43;
const materials=[];
for(let row=start;row<=end;row++){
const desc=v('D'+row),qty=n('H'+row),unit=n('J'+row);
if(desc&&(qty||unit))materials.push({orden:materials.length+1,clase:'material',descripcion:desc,cantidad:qty,precio_unitario:unit,subtotal:qty*unit,fila_origen:row});
}
const labor=[];
if(type==='COM-F-04')for(let row=14;row<=29;row++){
const desc=v('D'+row),hours=n('H'+row),rate=n('J'+row);
if(desc&&(hours||rate))labor.push({orden:labor.length+1,clase:'mano_obra',descripcion:desc,horas_totales:hours,precio_unitario:rate,subtotal:hours*rate,fila_origen:row});
}
const overhead=[];if(type==='COM-F-04')for(let row=48;row<=53;row++){const desc=v('D'+row),qty=n('H'+row),unit=n('J'+row);if(desc&&qty>0&&unit>0)overhead.push({orden:overhead.length+1,clase:'otros_gastos',descripcion:desc,cantidad:qty,precio_unitario:unit,subtotal:qty*unit,fila_origen:row});}\nconst subtotal=[...materials,...labor,...overhead].reduce((a,x)=>a+x.subtotal,0);\nconst administracion=type==='COM-F-06'?n('M45'):n('M44');\nconst resumenName=Object.keys(sheets).find(x=>x.toLowerCase().includes('cotizaci')&&x.toLowerCase().includes('resumen')&&!x.includes('\nconst iva=type==='COM-F-06'?n('M47'):0;
return {formato:type,numero:v('O11'),fecha:excelDate(v('D7')),cliente:v('D8'),direccion:v('D9'),proyecto:v('D10'),descripcion:v('I7'),observaciones:v(type==='COM-F-04'?'D66':'D53'),emisor:n('F3'),materials,labor,overhead,subtotal_calculado:subtotal,costo_interno:n(type==='COM-F-04'?'M60':'M44'),precio_cliente,administracion,total_original,iva,advertencias:[...(materials.length===(end-start+1)?['Se alcanzó el límite de 14 materiales; comprobar que no haya más líneas']:[]),...(type==='COM-F-04'&&labor.length===16?['Se alcanzó el límite de tres puestos de mano de obra']:[]),'Validar impuestos, comisión y total oficial antes de guardar']};
}
root.SBMV29Parser={read};
})(window);
));\nconst resumen=resumenName?sheets[resumenName]:null;\nconst precio_cliente=type==='COM-F-04'?number(resumen?.O20):n('M46');\nconst total_original=type==='COM-F-06'?n('M48'):precio_cliente;\nconst iva=type==='COM-F-06'?n('M47'):n('M59');
return {formato:type,numero:v('O11'),fecha:excelDate(v('D7')),cliente:v('D8'),direccion:v('D9'),proyecto:v('D10'),descripcion:v('I7'),observaciones:v(type==='COM-F-04'?'D66':'D53'),emisor:n('F3'),materials,labor,overhead,subtotal_calculado:subtotal,administracion,total_original,iva,advertencias:[...(materials.length===(end-start+1)?['Se alcanzó el límite de 14 materiales; comprobar que no haya más líneas']:[]),...(type==='COM-F-04'&&labor.length===16?['Se alcanzó el límite de tres puestos de mano de obra']:[]),'Validar impuestos, comisión y total oficial antes de guardar']};
}
root.SBMV29Parser={read};
})(window);
