import type { Metadata } from "next";
import { isAdmin, adminConfigured } from "@/lib/auth";
import { candidates, BALLOT_SIZE, scoreThreshold } from "@/lib/ballot";
import { getDisputes, getTodayBallot, tally } from "@/lib/store";
import { AdminPanel, AdminLogin } from "@/components/Admin";

export const metadata: Metadata = { title: "Admin", robots: { index: false, follow: false } };

export default async function Admin() {
  if (!adminConfigured()) {
    return (
      <div className="max-w-md">
        <h1 className="text-4xl">Admin</h1>
        <p className="mt-4 text-stamp">ADMIN_PASSWORD is not set. Set it and restart.</p>
      </div>
    );
  }
  if (!(await isAdmin())) {
    return (
      <div className="max-w-md">
        <h1 className="text-4xl">Admin</h1>
        <AdminLogin />
      </div>
    );
  }
  const today = getTodayBallot();
  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-4xl md:text-5xl">Admin</h1>
      <AdminPanel
        candidates={candidates()}
        size={BALLOT_SIZE}
        threshold={scoreThreshold()}
        today={today ? { id: today.id, options: today.options, votes: Object.keys(today.votes).length, tally: tally(today) } : null}
        disputes={getDisputes()}
      />
    </div>
  );
}
