interface PaperPageProps {
  params: { id: string };
}

export default function PaperDetailPage({ params }: PaperPageProps) {
  return (
    <main className="mx-auto min-h-screen max-w-5xl px-6 pt-24">
      <h1 className="mb-3 text-3xl font-semibold text-slate-700">论文详情</h1>
      <p className="text-slate-700">Paper ID: {params.id}</p>
    </main>
  );
}
