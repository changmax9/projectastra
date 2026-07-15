import { BluebookAuthPage } from "@/components/bluebook/BluebookAuthPage";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  return <BluebookAuthPage mode="login" />;
}
