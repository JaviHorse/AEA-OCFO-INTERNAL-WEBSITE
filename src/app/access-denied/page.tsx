import { AeaLogo, MascotPair } from "@/components/aea-brand";
import Link from "next/link";
import { ShieldX } from "lucide-react";
import { signOut } from "../actions";
export default function AccessDenied() {
  return (
    <main className="center-page">
      <div className="panel denied">
        <AeaLogo />
        <ShieldX size={42} />
        <h1>Access needs a membership.</h1>
        <p>Contact Finance to enable access for your Google account.</p>
        <a
          className="button primary"
          href="mailto:aea.college.org@student.ateneo.edu"
        >
          Contact Finance
        </a>
        <form action={signOut}>
          <button className="button secondary">Sign out</button>
        </form>
        <Link href="/login">Back to sign in</Link>
        <MascotPair className="account-mascots" />
      </div>
    </main>
  );
}
