/* V29: recuperación y persistencia de detalles, separada de los registros oficiales */
(function(){
'use strict';
const $=id=>document.getElementById(id);
let current=null,original=null;
const status=t=>{$('v29CloudStatus').textContent=t};
const num=x=>Number(x)||0;
const fmt=n=>new Intl.NumberFormat('es-CR',{minimumFractionDigits:2,maximumFractionDigits:2}).format(n);
const normalize=x=>String(x||'').trim().toUpperCase().replace(/\s+/g,'');
function detailsFromSnapshot(){
const data=cSnapshot(),rows=(data.items||[]).filter(x=>String(x.desc||'').trim()&&num(x.qty)>0);
const out=rows.map(x=>({clase:'suministro',descripcion:x.desc,cantidad:num(x.qty),precio_unitario:num(x.unit),subtotal:num(x.qty)*num(x.unit)}));
if(data.fields.cType==='labor')for(const x of v21LaborRows())if(x.qty>0&&x.hours>0)out.push({clase:'mano_obra',descripcion:x.name,puesto:x.name,cantidad:x.qty*x.hours,precio_unitario:x.rate,subtotal:x.qty*x.hours*x.rate,datos_extra:{job:x.job,qty:x.qty,hours:x.hours,hourType:x.hourType,shift:x.shift}});
return out;
}
function fillSnapshot(record,details){
const labor=record.tipo==='mano_obra'||details.some(x=>x.clase==='mano_obra');
const fields={cType:labor?'labor':'simple',cNumber:record.consecutivo||'',cDate:record.fecha_cotizacion||new Date().toISOString().slice(0,10),cClient:record.cliente||'',cAddress:'',cSite:record.proyecto||'',cDescription:record.descripcion||'',cNotes:record.observaciones||''};
const items=details.filter(x=>x.clase==='suministro').map(x=>({desc:x.descripcion,qty:x.cantidad,unit:x.precio_unitario}));
cRestore({fields,items});
const laborRows=details.filter(x=>x.clase==='mano_obra');
if(labor){$('v21LaborRows').innerHTML='';for(const x of laborRows){const e=x.datos_extra||{};v21AddLabor({job:e.job??0,qty:e.qty??1,hours:e.hours??x.cantidad,rate:x.precio_unitario,hourType:e.hourType??0,shift:e.shift??0})}}
cRecalc();
}
async function refresh(){
if(!cloudUser||!cloudClient){status('Inicia sesión en Supabase para consultar cotizaciones.');return}
const q=$('v29Search').value.trim();
let req=cloudClient.from('cotizaciones_registros').select('id,consecutivo,fecha_cotizacion,cliente,proyecto,descripcion,tipo,observaciones,bloqueado,precio_sin_iva,version').order('creado_en',{ascending:false}).limit(200);
if(q)req=req.or('consecutivo.ilike.%'+q.replace(/[,()%]/g,'')+'%,proyecto.ilike.%'+q.replace(/[,()%]/g,'')+'%');
const {data,error}=await req;if(error)throw Error(error.message);
$('v29CloudList').innerHTML='<option value="">Seleccionar registro</option>'+data.map(x=>'<option value="'+x.id+'">'+esc(x.consecutivo||'Sin número')+' · '+esc(x.proyecto||'')+'</option>').join('');
$('v29CloudList')._records=data;status(data.length+' registros disponibles. Solo los que tengan detalle guardado podrán regenerarse fielmente.');
}
async function load(){
const id=$('v29CloudList').value;if(!id)return;
const rec=($('v29CloudList')._records||[]).find(x=>x.id===id);if(!rec)throw Error('Registro no disponible');
const {data,error}=await cloudClient.from('cotizaciones_detalles').select('*').eq('cotizacion_id',id).order('orden');
if(error)throw Error(error.message);
if(!data.length){status('El registro existe, pero no tiene detalles guardados. Importa su Excel original una vez para reconstruirlos; no se inventarán líneas.');return}
if(!confirm('Abrir '+rec.consecutivo+' para edición local. No se modificará el registro oficial.'))return;
original=rec;current={id:rec.id,version:rec.version};fillSnapshot(rec,data);show('crear');
$('cMessage').textContent='V29: recuperada '+rec.consecutivo+' desde Supabase ('+data.length+' líneas). Los cambios no se guardan automáticamente.';
status('Recuperadas '+data.length+' líneas de '+rec.consecutivo+'.');
}
async function save(){
if(!cloudUser||!cloudClient)throw Error('Inicia sesión');
const fields=cSnapshot().fields;
const number=fields.cNumber.trim();if(!number)throw Error('Indica consecutivo');
const details=detailsFromSnapshot();if(!details.length)throw Error('No hay líneas para guardar');
const matched=original&&normalize(original.consecutivo)===normalize(number)?original:null;
if(matched&&matched.bloqueado)throw Error('Registro bloqueado; no se modificará');
if(!matched)throw Error('Para proteger registros oficiales, primero selecciona una cotización existente de Supabase. No se creará ni sustituirá automáticamente.');
if(!confirm('Guardar '+details.length+' líneas estructuradas de '+number+' en Supabase? Se conservará el registro y su importe oficial.'))return;
const {data:latest,error:readError}=await cloudClient.from('cotizaciones_registros').select('version,bloqueado').eq('id',matched.id).single();
if(readError)throw Error(readError.message);
if(latest.bloqueado||latest.version!==matched.version)throw Error('Registro modificado o bloqueado en otro dispositivo. Vuelve a cargarlo.');
const payload=details.map(x=>({...x,datos_extra:x.datos_extra||{}}));
const {data,error}=await cloudClient.rpc('cotizaciones_v29_guardar_detalles',{p_cotizacion:matched.id,p_detalles:payload});
if(error)throw Error(error.message);
status('Guardadas '+data+' líneas en Supabase. El total y los datos oficiales no se modificaron.');
$('cMessage').textContent='V29: detalles guardados de '+number+'. Revisa el Excel antes de enviarlo.';
}
async function importExcel(){
const file=$('v29File').files[0];if(!file)throw Error('Selecciona Excel original');
const parsed=await window.SBMV29Parser.read(file);
const snapshot={fields:{cType:parsed.formato==='COM-F-04'?'labor':'simple',cNumber:parsed.numero,cDate:parsed.fecha,cClient:parsed.cliente,cAddress:parsed.direccion,cSite:parsed.proyecto,cDescription:parsed.descripcion,cNotes:parsed.observaciones},items:parsed.materials.map(x=>({desc:x.descripcion,qty:x.cantidad,unit:x.precio_unitario}))};
if(!confirm('Preparar '+parsed.formato+' con '+parsed.materials.length+' materiales y '+parsed.labor.length+' líneas de mano de obra. No se guardará todavía.'))return;
original=null;current=null;cRestore(snapshot);
if(parsed.labor.length){$('v21LaborRows').innerHTML='';for(const x of parsed.labor)v21AddLabor({qty:1,hours:x.horas_totales,rate:x.precio_unitario})}
show('crear');$('cMessage').textContent='V29: '+parsed.formato+' importado. Subtotal extraído ₡'+fmt(parsed.subtotal_calculado)+'. Verifica precio comercial, administración e IVA. No se ha guardado nada.';
status('Importación local: '+parsed.numero+' · '+parsed.materials.length+' materiales · '+parsed.labor.length+' mano de obra. Sin cambios en Supabase.');
}
function run(fn){return async()=>{try{await fn()}catch(e){status('Error: '+e.message)}}}
function init(){
const panel=$('v27ConsultPanel');if(!panel)return;
const wrap=document.createElement('div');wrap.className='panel';wrap.innerHTML='<h2>V29 · Recuperación desde Supabase (pruebas)</h2><p class="muted">Busca una cotización con detalle almacenado para editarla en cualquier dispositivo. No se modifica el importe oficial ni se sobrescriben registros históricos.</p><div class="grid two"><div><label>Buscar consecutivo o proyecto</label><input id="v29Search" placeholder="Ej. LSEG-26-016"></div><div><label>Registro con detalle</label><select id="v29CloudList"><option value="">Consultar registros</option></select></div></div><div class="actions"><button type="button" class="secondary" id="v29CloudRefresh">Buscar en Supabase</button><button type="button" id="v29CloudOpen">Abrir detalle para editar</button><button type="button" class="secondary" id="v29CloudSave">Guardar detalles del generador</button></div><p class="muted">Para cotizaciones anteriores sin detalle: selecciona el Excel original una sola vez. El archivo no se sube ni se almacena; solo se extraen sus datos.</p><input type="file" id="v29File" accept=".xlsx,.xlsm"><div class="actions"><button type="button" id="v29Read">Extraer datos del Excel</button></div><div id="v29CloudStatus" role="status" class="muted">Inicia sesión y busca un registro.</div>';
panel.appendChild(wrap);
$('v29CloudRefresh').onclick=run(refresh);$('v29CloudOpen').onclick=run(load);$('v29CloudSave').onclick=run(save);$('v29Read').onclick=run(importExcel);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();