import {notFound,redirect} from "next/navigation";
import {workspaceReleaseEnabled} from "@/platform/workspace-release";
import {workspaceHttpActor} from "@/platform/workspaces/http";
import {moneyRpc} from "@/platform/connect";
import ReviewQueue,{type ReconciliationIssue} from "./ReviewQueue";
export const dynamic="force-dynamic";
export default async function Page(){if(!workspaceReleaseEnabled()||process.env.STRELVA_MONEY_RECONCILIATION!=="1")notFound();const actor=await workspaceHttpActor();if(!actor)redirect("/sign-in");let issues:ReconciliationIssue[];try{issues=await moneyRpc("read_money_reconciliation",{p_user:actor.userId,p_email:actor.verifiedEmail,p_limit:100});}catch{return <main className="mx-auto max-w-xl px-6 py-12"><h1 className="font-display text-2xl">Payment exceptions</h1><p role="alert" className="mt-6">Payment exceptions could not be loaded. Confirm operator access and try again.</p></main>;}return <main className="mx-auto max-w-xl px-6 py-12"><h1 className="font-display text-2xl">Payment exceptions</h1><p className="mt-4 text-gray-muted">Review unmatched provider receipts against the immutable ledger, then record what happened.</p><ReviewQueue key={actor.userId} issues={issues}/></main>;}
