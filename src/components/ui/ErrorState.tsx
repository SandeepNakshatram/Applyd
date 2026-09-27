export function ErrorState({ message = "Something went wrong." }: { message?: string }) {
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 px-6 py-8 text-center text-sm text-red-700">
      {message}
    </div>
  );
}
