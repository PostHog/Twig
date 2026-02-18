export default function Playground() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <section>
        <h2 className="mb-6 border-b pb-2 text-heading-3">Typography</h2>
        <div className="flex flex-col gap-4">
          <p className="text-display">Display</p>
          <p className="text-heading-1">Heading 1</p>
          <p className="text-heading-2">Heading 2</p>
          <p className="text-heading-3">Heading 3</p>
          <p className="text-heading-4">Heading 4</p>
          <p className="text-body">
            Body — The quick brown fox jumps over the lazy dog.
          </p>
          <p className="text-body-sm">
            Body Small — The quick brown fox jumps over the lazy dog.
          </p>
          <p className="text-caption">
            Caption — The quick brown fox jumps over the lazy dog.
          </p>
          <p className="font-mono text-code">Code — const x = 42;</p>
        </div>
      </section>
    </main>
  );
}
