/* V29: recuperación y persistencia de detalles, separada de los registros oficiales */
(function(){
'use strict';
const $=id=>document.getElementById(id);
let current=null,original=null,imported=null,retainedOther=[],retainedLabor=[],originalMetadata=null;
window.SBMV29LaborName=function(i,jobName){const source=imported?.labor?.[i]||retainedLabor[i];return source?.descripcion||jobName};
const status=t=>{$('v29CloudStatus').textContent=t};
const num=x=>Number(x)||0;
const fmt=n=>new Intl.NumberFormat('es-CR',{minimumFractionDigits:2,maximumFractionDigits:2}).format(n);
const normalize=x=>String(x||'').trim().toUpperCase().replace(/\s+/g,'');
function detailsFromSnapshot(){
const data=cSnapshot(),rows=(data.items||[]).filter(x=>String(x.desc||'').trim()&&num(x.qty)>0);
const out=rows.map(x=>({clase:'suministro',descripcion:x.desc,cantidad:num(x.qty),precio_unitario:num(x.unit),subtotal:num(x.qty)*num(x.unit)}));
if(data.fields.cType==='labor')for(const [i,x] of v21LaborRows().entries())if(x.qty>0&&x.hours>0){const prev=imported?.labor?.[i]||retainedLabor[i];const row=document.querySelectorAll('.v21LaborRow')[i];const name=row?.dataset.originalDescription||x.name;out.push({clase:'mano_obra',descripcion:name,puesto:name,cantidad:x.qty*x.hours,precio_unitario:x.rate,subtotal:x.qty*x.hours*x.rate,datos_extra:{job:x.job,qty:x.qty,hours:x.hours,hourType:x.hourType,shift:x.shift,descripcion_original:row?.dataset.originalDescription||null}})}
if(imported&&normalize(imported.numero)===normalize(data.fields.cNumber)){for(const x of imported.overhead||[])out.push({clase:'otro',descripcion:x.descripcion,cantidad:x.cantidad,precio_unitario:x.precio_unitario,subtotal:x.subtotal,datos_extra:{fila_origen:x.fila_origen}})}else for(const x of retainedOther)out.push({clase:'otro',descripcion:x.descripcion,cantidad:num(x.cantidad),precio_unitario:num(x.precio_unitario),subtotal:num(x.subtotal),datos_extra:x.datos_extra||{}})
return out;
}
function fillSnapshot(record,details){
const storedFormat=details.find(x=>x.datos_extra?.v29_origen)?.datos_extra.v29_origen?.formato;const labor=storedFormat?storedFormat==='COM-F-04':(record.tipo==='mano_obra'||details.some(x=>x.clase==='mano_obra'));
const fields={cType:labor?'labor':'simple',cNumber:record.consecutivo||'',cDate:record.fecha_cotizacion||new Date().toISOString().slice(0,10),cClient:record.cliente||'',cAddress:details.find(x=>x.datos_extra?.v29_origen)?.datos_extra.v29_origen?.direccion||'',cSite:record.proyecto||'',cDescription:record.descripcion||'',cNotes:record.observaciones||''};
const items=details.filter(x=>x.clase==='suministro').map(x=>({desc:x.descripcion,qty:x.cantidad,unit:x.precio_unitario}));
cRestore({fields,items});
const laborRows=details.filter(x=>x.clase==='mano_obra');
if($('v21LaborRows'))$('v21LaborRows').innerHTML='';if(labor){for(const x of laborRows){const e=x.datos_extra||{};v21AddLabor({job:e.job??0,qty:e.qty??1,hours:e.hours??x.cantidad,rate:x.precio_unitario,hourType:e.hourType??0,shift:e.shift??0,originalDescription:x.descripcion})}}
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
original=rec;imported=null;retainedOther=data.filter(x=>x.clase==='otro');retainedLabor=data.filter(x=>x.clase==='mano_obra');
const origen=data.find(x=>x.datos_extra?.v29_origen)?.datos_extra.v29_origen;originalMetadata=origen||null;if(origen)status('Origen '+origen.formato+' · precio comercial original ₡'+fmt(origen.precio_cliente)+' · costo interno ₡'+fmt(origen.costo_interno));current={id:rec.id,version:rec.version};fillSnapshot(rec,data);if(origen?.emisor!==undefined&&$('v20Issuer'))$('v20Issuer').value=origen.emisor;show('crear');
$('cMessage').textContent='V29: recuperada '+rec.consecutivo+' desde Supabase ('+data.length+' líneas). Los cambios no se guardan automáticamente.';
const labor=data.some(x=>x.clase==='mano_obra');
const alerts=[];if(labor&&rec.tipo!=='mano_obra')alerts.push('clasificación histórica distinta: el detalle contiene mano de obra');if(origen&&Math.abs(num(origen.precio_cliente)-num(rec.precio_sin_iva))>Math.max(1,num(rec.precio_sin_iva)*0.0001))alerts.push('precio original distinto del registro');if(origen&&num(origen.administracion)>0)alerts.push('administración original ₡'+fmt(origen.administracion)+' (verificar contra registro)');status('Recuperadas '+data.length+' líneas de '+rec.consecutivo+'.'+(alerts.length?' Atención: '+alerts.join('; ')+'.':''));
}
async function save(){
if(!cloudUser||!cloudClient)throw Error('Inicia sesión');
const fields=cSnapshot().fields;
const number=fields.cNumber.trim();if(!number)throw Error('Indica consecutivo');
const details=detailsFromSnapshot();if(!details.length)throw Error('No hay líneas para guardar');
if(imported&&imported.formato==='COM-F-04'&&imported.labor.length&&details.filter(x=>x.clase==='mano_obra').length!==imported.labor.length)throw Error('No coinciden las líneas de mano de obra con el Excel importado. Revisa antes de guardar.');
if(imported&&normalize(imported.numero)!==normalize(number))throw Error('El consecutivo fue cambiado después de importar el Excel. Vuelve a importar el archivo correcto.');
if(imported){const expectedType=imported.formato==='COM-F-04'?'labor':'simple';if(fields.cType!==expectedType)throw Error('El formato de la cotización cambió después de importar el Excel.');const subtotal=details.reduce((a,x)=>a+num(x.subtotal),0);if(Math.abs(subtotal-imported.subtotal_calculado)>Math.max(0.05,imported.subtotal_calculado*0.00001))throw Error('El costo de los renglones cambió respecto al Excel original. Para cambiar importes, actualiza primero la cotización por el flujo oficial.');}
let matched=original&&normalize(original.consecutivo)===normalize(number)?original:null;
if(!matched){const {data:matches,error:matchError}=await cloudClient.from('cotizaciones_registros').select('id,consecutivo,version,bloqueado,precio_sin_iva').ilike('consecutivo',number).limit(20);if(matchError)throw Error(matchError.message);matched=(matches||[]).find(x=>normalize(x.consecutivo)===normalize(number))||null;}
if(matched&&original&&original.id!==matched.id)throw Error('El consecutivo no corresponde al registro abierto.');
if(matched&&matched.bloqueado)throw Error('Registro bloqueado; no se modificará');
if(imported&&matched&&num(matched.precio_sin_iva)>0&&Math.abs(num(matched.precio_sin_iva)-num(imported.precio_cliente))>Math.max(1,num(matched.precio_sin_iva)*0.0001))throw Error('El precio comercial del Excel (₡'+fmt(imported.precio_cliente)+') no coincide con el registro oficial (₡'+fmt(matched.precio_sin_iva)+'). Se detuvo el guardado para evitar vincular datos incorrectos.');
if(!imported&&originalMetadata){const format=originalMetadata.formato;if(format&&fields.cType!==(format==='COM-F-04'?'labor':'simple'))throw Error('El formato del Excel recuperado no puede cambiarse sin volver a importar el original.');}
if(!imported&&originalMetadata){const expected=num(originalMetadata.subtotal_calculado??originalMetadata.costo_interno),actual=details.reduce((a,x)=>a+num(x.subtotal),0);if(expected>0&&Math.abs(expected-actual)>Math.max(0.05,expected*0.00001))throw Error('El costo de las líneas editadas difiere del original. No se guardarán importes distintos sin actualizar la cotización oficial.');}
if(!matched)throw Error('No existe ese consecutivo en Supabase. Primero regístralo por el flujo oficial; no se creará un registro duplicado.');
if(!confirm('Guardar '+details.length+' líneas estructuradas de '+number+' en Supabase? Se conservará el registro y su importe oficial. El Excel regenerado requiere verificación antes de enviarse.'))return;
const {data:latest,error:readError}=await cloudClient.from('cotizaciones_registros').select('version,bloqueado').eq('id',matched.id).single();
if(readError)throw Error(readError.message);
if(latest.bloqueado||Number(latest.version)!==Number(matched.version))throw Error('Registro modificado o bloqueado en otro dispositivo. Vuelve a cargarlo.');
const payload=details.map((x,i)=>({...x,datos_extra:{...(x.datos_extra||{}),...(i===0&&(imported||originalMetadata)?{v29_origen:imported?{formato:imported.formato,precio_cliente:imported.precio_cliente,costo_interno:imported.costo_interno,administracion:imported.administracion,iva:imported.iva,total_original:imported.total_original,subtotal_calculado:imported.subtotal_calculado,direccion:imported.direccion,emisor:imported.emisor}:originalMetadata}:{})}}));
const {data,error}=await cloudClient.rpc('cotizaciones_v29_guardar_detalles',{p_cotizacion:matched.id,p_detalles:payload});
if(error)throw Error(error.message);
original=matched;status('Guardadas '+data+' líneas en Supabase. El total y los datos oficiales no se modificaron.');if($('v29SaveFeedback'))$('v29SaveFeedback').textContent='Guardadas '+data+' líneas de '+number+' en Supabase.';
$('cMessage').textContent='V29: detalles guardados de '+number+'. Revisa el Excel antes de enviarlo.';
}
async function importExcel(){
const file=$('v29File').files[0];if(!file)throw Error('Selecciona Excel original');
const parsed=await window.SBMV29Parser.read(file);
const snapshot={fields:{cType:parsed.formato==='COM-F-04'?'labor':'simple',cNumber:parsed.numero,cDate:parsed.fecha,cClient:parsed.cliente,cAddress:parsed.direccion,cSite:parsed.proyecto,cDescription:parsed.descripcion,cNotes:parsed.observaciones},items:parsed.materials.map(x=>({desc:x.descripcion,qty:x.cantidad,unit:x.precio_unitario}))};
if(!confirm('Preparar '+parsed.formato+' con '+parsed.materials.length+' materiales y '+parsed.labor.length+' líneas de mano de obra. No se guardará todavía.'))return;
original=null;current=null;retainedOther=[];retainedLabor=[];originalMetadata=null;imported=parsed;cRestore(snapshot);if($('v20Issuer')&&Number.isFinite(Number(parsed.emisor)))$('v20Issuer').value=parsed.emisor;
if($('v21LaborRows'))$('v21LaborRows').innerHTML='';if(parsed.formato==='COM-F-04'){for(const x of parsed.labor)v21AddLabor({qty:1,hours:x.horas_totales,rate:x.precio_unitario,originalDescription:x.descripcion})}
show('crear');$('cMessage').textContent='V29: '+parsed.formato+' importado. Subtotal extraído ₡'+fmt(parsed.subtotal_calculado)+'. Verifica precio comercial, administración e IVA. No se ha guardado nada.';
status('Importación local: '+parsed.numero+' · '+parsed.materials.length+' materiales · '+parsed.labor.length+' mano de obra. Precio original ₡'+fmt(parsed.precio_cliente)+'. Sin cambios en Supabase.');
}
function run(fn){return async()=>{try{await fn()}catch(e){const message='Error: '+e.message;status(message);if($('v29SaveFeedback'))$('v29SaveFeedback').textContent=message}}}
function init(){
const panel=$('v27ConsultPanel');if(!panel)return;
const wrap=document.createElement('div');wrap.className='panel';wrap.innerHTML='<h2>V29 · Recuperación desde Supabase (pruebas)</h2><p class="muted">Busca una cotización con detalle almacenado para editarla en cualquier dispositivo. No se modifica el importe oficial ni se sobrescriben registros históricos.</p><div class="grid two"><div><label>Buscar consecutivo o proyecto</label><input id="v29Search" placeholder="Ej. LSEG-26-016"></div><div><label>Registro con detalle</label><select id="v29CloudList"><option value="">Consultar registros</option></select></div></div><div class="actions"><button type="button" class="secondary" id="v29CloudRefresh">Buscar en Supabase</button><button type="button" id="v29CloudOpen">Abrir detalle para editar</button><button type="button" class="secondary" id="v29CloudSave">Guardar detalles del generador</button></div><p class="muted">Para cotizaciones anteriores sin detalle: selecciona el Excel original una sola vez. El archivo no se sube ni se almacena; solo se extraen sus datos.</p><input type="file" id="v29File" accept=".xlsx,.xlsm"><div class="actions"><button type="button" id="v29Read">Extraer datos del Excel</button></div><div id="v29CloudStatus" role="status" class="muted">Inicia sesión y busca un registro.</div>';
panel.appendChild(wrap);
const createSection=$('crear');if(createSection){const bar=document.createElement('div');bar.className='panel';bar.innerHTML='<h3>V29 · Detalle recuperado</h3><p class="muted">Guarda los renglones editados en Supabase sin modificar el importe ni el estado oficial de la cotización.</p><div class="actions"><button type="button" id="v29SaveFromCreate">Guardar detalles en Supabase</button></div><div id="v29SaveFeedback" role="status" class="muted"></div>';createSection.appendChild(bar);$('v29SaveFromCreate').onclick=run(async()=>{await save();$('v29SaveFeedback').textContent=$('v29CloudStatus').textContent})}
$('v29CloudRefresh').onclick=run(refresh);$('v29CloudOpen').onclick=run(load);$('v29CloudSave').onclick=run(save);$('v29Read').onclick=run(importExcel);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();