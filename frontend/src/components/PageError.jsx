import { AlertCircle } from "lucide-react";
import { Button } from "./ui/button";

export function PageError({ message = "We couldn’t load this page.", onRetry = () => window.location.reload() }) {
  return <section role="alert" className="mx-auto max-w-lg px-5 py-20 text-center">
    <AlertCircle className="mx-auto mb-4 h-10 w-10 text-primary" />
    <h1 className="font-display text-2xl font-bold">Let’s try that again.</h1>
    <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{message} Check your connection and try again.</p>
    <div className="mt-6 flex flex-wrap justify-center gap-3"><Button onClick={onRetry}>Try again</Button><Button asChild variant="outline"><a href="/">Back to Discover</a></Button></div>
  </section>;
}
