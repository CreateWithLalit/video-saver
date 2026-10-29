"use client";
import { motion } from "framer-motion";
import { CheckCircle2, Download } from "lucide-react";
import type { JobEvent } from "../lib/api";
import { StageIndicator } from "./StageIndicator";
const size=(n:number|null)=>n===null?"—":`${(n/1048576).toFixed(1)} MB`; export function ProgressCard({jobId,event}:{jobId:string;event:JobEvent|null}){const done=event?.stage==="done";return <motion.section initial={{opacity:0,y:12}} animate={{opacity:1,y:0}} className="glass card"><div className="spaced"><h2>{done?<><CheckCircle2 color="#22d3ee"/> Complete</>:"Downloading"}</h2><strong>{event?`${Math.round(event.percent)}%`:"0%"}</strong></div><div className="progress"><i style={{width:`${event?.percent??0}%`}}/></div><StageIndicator stage={event?.stage??"queued"}/><p className="muted">{event?.message??"Waiting for server…"}</p><p className="muted">{size(event?.downloaded_bytes??null)} / {size(event?.total_bytes??null)} {event?.speed?` · ${(event.speed/1048576).toFixed(1)} MB/s`:""}</p>{done?<a className="btn" href={`/api/jobs/${jobId}/file` }><Download size={18}/> Save to device</a>:null}{event?.stage==="error"?<p role="alert">{event.message}</p>:null}</motion.section>}
