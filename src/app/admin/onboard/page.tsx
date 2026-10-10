"use client";
import { Suspense } from "react";
import { StHead, StPage, StSkeleton } from "@/components/ui/strelva/Kit";
import { OnboardForm } from "./OnboardForm";
export default function Page() { return <Suspense fallback={<StPage><StHead title="Onboard a client" /><StSkeleton label="Loading client setup" /></StPage>}><OnboardForm /></Suspense>; }
