import { RevealCard } from '@/components/motion';
import { useId } from 'react';
import { AreaChart, Area, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { CalendarCheck, Wallet } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { formatCurrency } from '@/lib/format';

interface Props {
  monthly: { month:string; collection:number; income:number; expenses:number }[];
}
export function DashboardAnalytics({ monthly }: Props) {
 const id=useId().replace(/:/g,'');
  return <div className="grid min-w-0 gap-5 xl:grid-cols-[1fr]">
 <RevealCard className="min-w-0"><CardHeader><CardTitle className="flex items-center gap-2"><Wallet className="h-4 w-4 text-primary"/>Fee collection</CardTitle><CardDescription>Recorded collections by month</CardDescription></CardHeader><CardContent>{monthly.some(m=>m.collection>0)?<><div className="h-52 w-full" role="img" aria-label="Monthly fee collection chart"><ResponsiveContainer width="100%" height="100%"><AreaChart data={monthly} margin={{left:0,right:10,top:12,bottom:0}}><defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--brand-primary)" stopOpacity={.22}/><stop offset="100%" stopColor="var(--brand-primary)" stopOpacity={0}/></linearGradient></defs><CartesianGrid stroke="hsl(var(--border))" vertical={false} strokeDasharray="4 4"/><XAxis dataKey="month" axisLine={false} tickLine={false} tick={{fontSize:10,fill:'hsl(var(--muted-foreground))'}}/><YAxis width={48} axisLine={false} tickLine={false} tick={{fontSize:10,fill:'hsl(var(--muted-foreground))'}} tickFormatter={v=>v>=100000?`${v/100000}k`:String(v/100)}/><Tooltip formatter={(v:number)=>formatCurrency(v)} contentStyle={{borderRadius:14,background:'hsl(var(--card))',border:'1px solid hsl(var(--border))',color:'hsl(var(--foreground))'}}/><Area name="Collection" type="monotone" dataKey="collection" stroke="var(--brand-primary)" strokeWidth={2.5} fill={`url(#${id})`} isAnimationActive={false}/></AreaChart></ResponsiveContainer></div><details className="mt-3 text-xs text-muted-foreground"><summary className="cursor-pointer">View collection figures</summary><ul className="mt-3 space-y-2">{monthly.map(m=><li key={m.month} className="flex justify-between"><span>{m.month}</span><span>{formatCurrency(m.collection)}</span></li>)}</ul></details></>:<div className="flex h-52 flex-col items-center justify-center rounded-2xl bg-muted/50 text-center"><Wallet className="mb-3 h-7 w-7 text-primary"/><p className="font-medium">Your collection story starts here</p><p className="mt-2 max-w-xs text-xs text-muted-foreground">Recorded fee payments will appear in your monthly collection chart.</p></div>}</CardContent></RevealCard></div>;
}
