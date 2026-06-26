import ChangeOrderBuilder from '@/components/estimation/ChangeOrderBuilder'

export default async function ChangeOrderBuilderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <ChangeOrderBuilder id={id} />
}
