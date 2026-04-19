import { redirect } from "next/navigation";
import { auth } from "@/auth";

export async function requireAdminSession() {
  const session = await auth();

  if (!session?.user || session.user.role !== "ADMIN") {
    redirect("/");
  }

  return session;
}
