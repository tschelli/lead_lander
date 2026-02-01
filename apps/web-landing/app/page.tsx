import { redirect } from "next/navigation";

/**
 * Root page for school landing site
 * Since each deployment is school-specific, this redirects to the default program
 * or shows a 404. Configure DEFAULT_PROGRAM_SLUG or implement a program list.
 */
export default function Home() {
  // Option 1: Redirect to default program
  // const DEFAULT_PROGRAM_SLUG = process.env.DEFAULT_PROGRAM_SLUG;
  // if (DEFAULT_PROGRAM_SLUG) {
  //   redirect(`/${DEFAULT_PROGRAM_SLUG}`);
  // }

  // Option 2: Show simple page
  return (
    <main>
      <div className="form-card">
        <h2>Welcome</h2>
        <p>Visit a program page to learn more and apply.</p>
        <p>Example: <strong>/medical-assistant</strong></p>
      </div>
    </main>
  );
}
