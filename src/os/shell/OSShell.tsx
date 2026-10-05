import {useEffect,useState,type ReactNode} from 'react';
import {useOS,type Workspace} from '../state/os-context.tsx';
import {request} from '../state/api.ts';
import {AIPresence} from './AIPresence.tsx';
import {PrimaryNavigation} from './PrimaryNavigation.tsx';
import {ChatDock} from './ChatDock.tsx';
import {BootExperience} from '../boot/BootExperience.tsx';
import {WorkspaceRouter} from '../workspaces/WorkspaceRouter.tsx';
import {LiveOperationsPanel,GovernanceStatusPanel,RuntimeStatusPanel,OperatorCredentialsPanel,SoundToggle} from './SpatialPanels.tsx';
import {ActivityTimeline} from './ActivityTimeline.tsx';
import {AIInsights} from './AIInsights.tsx';
import {QuickActions} from './QuickActions.tsx';

const destinations:{id:Workspace;label:string;detail:string;icon:string}[]=[
 {id:'mission',label:'MISSION CONTROL',detail:'Goals, progress & approvals',icon:'◈'},
 {id:'intelligence',label:'AI INTELLIGENCE CORE',detail:'Reasoning & memory',icon:'◎'},
 {id:'agents',label:'AGENTS MANAGEMENT',detail:'Agent registry & activity',icon:'⬡'},
 {id:'laboratory',label:'WORKSPACE / SANDBOX',detail:'Files, tools & governed builds',icon:'⌘'},
 {id:'system',label:'SYSTEM INFRASTRUCTURE',detail:'Runtime & credential health',icon:'⚙'},
];
function Panel({title,children,tone='cyan'}:{title:string;children:ReactNode;tone?:string}){
 return <section className={`reference-panel ${tone}`}><h2>{title}</h2>{children}</section>;
}
function Connection(){
 const {adminKey,setAdminKey,tenantId}=useOS();const [key,setKey]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const connect=async()=>{if(!key.trim())return;setBusy(true);setError('');try{await request('/api/autonomy/introspection',key.trim(),tenantId);setAdminKey(key.trim());setKey('');}catch(e){setError(e instanceof Error?e.message:String(e));}finally{setBusy(false);}};
 return <div className="reference-connection"><label htmlFor="operator-key">Operator access</label><p>{adminKey?'A key is set. Verify a replacement before changing access.':'Connect your backend to activate commands and live telemetry.'}</p><input id="operator-key" type="password" autoComplete="off" placeholder="Admin key" value={key} onChange={e=>setKey(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')void connect();}}/><button disabled={busy||!key.trim()} onClick={()=>void connect()}>{busy?'Verifying…':'Verify & connect'}</button><p role="status">{error}</p></div>;
}
export function OSShell(){
 const {adminKey,lastError,tenantId,booted,setBooted,setWorkspace,aiState}=useOS();
 const [workspaceOpen,setWorkspaceOpen]=useState(false),[settings,setSettings]=useState(false),[settingsTab,setSettingsTab]=useState('General'),[clock,setClock]=useState(new Date());
 useEffect(()=>{const timer=setInterval(()=>setClock(new Date()),1000);return()=>clearInterval(timer);},[]);
 useEffect(()=>{const onKey=(e:KeyboardEvent)=>{if(e.key==='Escape'){setSettings(false);setWorkspaceOpen(false);}};window.addEventListener('keydown',onKey);return()=>window.removeEventListener('keydown',onKey);},[]);
 if(!booted)return <BootExperience adminKey={adminKey} tenantId={tenantId} onDone={()=>setBooted(true)}/>;
 const open=(id:Workspace)=>{setWorkspace(id);setWorkspaceOpen(true);};
 return <div className="reference-os">
  <aside className="reference-sidebar"><div className="reference-brand"><span className="brand-emblem">⬡</span><div>MICROFIXD<small>COGNITIVE OPERATING SYSTEM</small></div></div><PrimaryNavigation onSelect={()=>setWorkspaceOpen(true)}/><div className="reference-sidebar-status"><span className={`status-dot ${lastError?'warning':''}`}/>{!adminKey?'NOT CONNECTED':lastError?'ATTENTION REQUIRED':'OPERATOR KEY SET'}<small>{aiState.toUpperCase()} · LIVE STATUS IN SYSTEM</small></div><button className="reference-settings-button" onClick={()=>setSettings(true)}>⚙ <span>Settings</span></button></aside>
  <div className="reference-main"><header className="reference-topbar"><span className="reference-breadcrumb">MISSION <b>/</b> COMMAND CENTER</span><div><span className="reference-time">SYSTEM TIME <b>{clock.toLocaleTimeString()}</b></span><span className="reference-state">{aiState.toUpperCase()}</span><button aria-label="Open settings" onClick={()=>setSettings(true)}>⚙</button><button onClick={()=>{setSettingsTab('Connections');setSettings(true);}}>◎ {adminKey?'OPERATOR':'CONNECT'}</button></div></header>
   <div className="reference-dashboard">
    <div className="reference-left"><Panel title="ACTIVE OPERATIONS"><LiveOperationsPanel/></Panel><Panel title="AI INSIGHTS" tone="violet"><AIInsights/></Panel><Panel title="GOVERNANCE"><GovernanceStatusPanel/></Panel></div>
    <main className="reference-presence"><div className="reference-presence-heading"><span>MICROFIXD</span><small>AUTONOMOUS INTELLIGENCE · HUMAN SUPERVISION</small></div><div className="reference-head"><AIPresence/></div><div className="reference-command"><p>What would you like me to accomplish?</p><ChatDock/><QuickActions/><div className="reference-wave" aria-hidden="true">{Array.from({length:29},(_,i)=><i key={i} style={{height:`${4+Math.sin(i*1.7)**2*12}px`,animationDelay:`${i*.06}s`}}/>)}</div></div></main>
    <div className="reference-right"><Panel title="SYSTEM TELEMETRY" tone="violet"><RuntimeStatusPanel/></Panel><Panel title="QUICK ACTIONS" tone="violet"><QuickActions/></Panel><Panel title="RECENT ACTIVITY"><ActivityTimeline/></Panel><Panel title="SUGGESTED WORKFLOWS" tone="violet"><button className="workflow-link" onClick={()=>open('mission')}>Review mission progress <span>↗</span></button><button className="workflow-link" onClick={()=>open('agents')}>Inspect agent activity <span>↗</span></button><button className="workflow-link" onClick={()=>open('system')}>Review system health <span>↗</span></button></Panel></div>
   </div>
   <footer className="reference-workspaces">{destinations.map(d=><button key={d.id} onClick={()=>open(d.id)}><span>{d.icon}</span><div><b>{d.label}</b><small>{d.detail}</small></div><i>↗</i></button>)}</footer>
  </div>
  {workspaceOpen&&<div className="reference-overlay"><header><b>WORKSPACE</b><button onClick={()=>setWorkspaceOpen(false)} aria-label="Close workspace">✕</button></header><div className="reference-workspace-content"><WorkspaceRouter/></div></div>}
  {settings&&<div className="reference-modal-backdrop"><section className="reference-settings" role="dialog" aria-modal="true" aria-label="Settings"><header><b>SETTINGS</b><button onClick={()=>setSettings(false)} aria-label="Close settings">✕</button></header><div className="reference-settings-body"><nav>{['General','Voice','Connections','Governance'].map(tab=><button key={tab} aria-selected={tab===settingsTab} onClick={()=>setSettingsTab(tab)}>{tab}</button>)}</nav><div>{settingsTab==='General'&&<><h2>Microfixd OS</h2><p>Standalone operator interface. Panels show backend responses; missing data stays unavailable.</p><RuntimeStatusPanel/></>}{settingsTab==='Voice'&&<SoundToggle/>}{settingsTab==='Connections'&&<><Connection/><OperatorCredentialsPanel/></>}{settingsTab==='Governance'&&<GovernanceStatusPanel/>}</div></div></section></div>}
 </div>;
}
