import type { Metadata } from "next";
import { dyn } from "@/lib/request";
import { isAdmin, adminConfigured } from "@/lib/auth";
import { getDisputes, getLeads } from "@/lib/store";
import { getAgentStatus } from "@/lib/data";
import { AdminPanel, AdminLogin } from "@/components/Admin";

export const metadata: Metadata = { title: "Admin", robots: { index: false, follow: false } };

export default async function Admin() {
  await dyn();
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
  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-4xl md:text-5xl">Admin</h1>
      <AdminPanel disputes={await getDisputes()} leads={await getLeads()} agent={getAgentStatus()} />
    </div>
  );
}
