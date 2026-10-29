"use client";
import { useEffect, useState } from "react";
import type { JobEvent } from "../lib/api";
export function useJobEvents(jobId:string|null){const [event,setEvent]=useState<JobEvent|null>(null);useEffect(()=>{if(!jobId)return;let high=0;const source=new EventSource(`/api/jobs/${jobId}/events`);source.onmessage=(message)=>{try{const next=JSON.parse(message.data) as JobEvent;if(typeof next.percent!=="number")return;high=Math.max(high,next.percent);setEvent({...next,percent:high});}catch{/* ignore malformed transient event */}};return()=>source.close();},[jobId]);return event;}
