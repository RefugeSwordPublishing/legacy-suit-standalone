import EstimateBuilder from '@/components/estimation/EstimateBuilder'

export default async function EstimateBuilderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <EstimateBuilder id={id} />
}
