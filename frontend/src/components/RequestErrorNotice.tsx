import { useEffect, useState } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from './ui/button';

/** A persistent fallback for list pages that also report failures in a toast. */
export function RequestErrorNotice({ route }: { route: string }) {
 const [failed,setFailed]=useState(false);
 useEffect(()=>{setFailed(false);const id=api.interceptors.response.use(response=>response,error=>{
   if(error.config?.method==='get' && error.response?.status!==401 && error.response?.status!==403) setFailed(true);
   return Promise.reject(error);
 });return()=>api.interceptors.response.eject(id);},[route]);
 if(!failed)return null;
 return <div role="alert" className="mb-5 flex flex-wrap items-center gap-3 rounded-2xl border border-destructive/20 bg-card p-4"><AlertCircle className="h-5 w-5 shrink-0 text-destructive"/><div className="min-w-0 flex-1"><p className="text-sm font-medium">Some school information couldn’t be loaded.</p><p className="mt-1 text-xs text-muted-foreground">The records below may be incomplete. Reload to try again.</p></div><Button variant="outline" size="sm" onClick={()=>window.location.reload()}><RefreshCw/>Reload page</Button></div>;
}
