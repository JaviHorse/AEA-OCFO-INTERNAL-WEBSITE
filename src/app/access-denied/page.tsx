import Link from "next/link";
import { ShieldX } from "lucide-react";
import { signOut } from "../actions";
export default function AccessDenied() {
  return (
    <main className="center-page">
      <div className="panel denied">
        <ShieldX size={42} />
        <h1>Access needs a membership.</h1>
        <p>
          Your Google account must belong to an active AEA membership for the
          current fiscal year. Contact OCFO to confirm your department and role.
        </p>
        <a
          className="button primary"
          href="mailto:aea.college.org@student.ateneo.edu"
        >
          Contact OCFO
        </a>
        <form action={signOut}>
          <button className="button secondary">Sign out</button>
        </form>
        <Link href="/login">Back to sign in</Link>
      </div>
    </main>
  );
}
