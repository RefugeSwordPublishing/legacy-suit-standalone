import ClientSearchPicker from '@/components/shared/ClientSearchPicker';

// Thin wrapper, keeps ProjectFormDialog working unchanged (passes client_name string)
export default function ClientPicker({ value, onChange }) {
  return (
    <ClientSearchPicker
      mode="name"
      value={value}
      onChange={onChange}
      placeholder="Search client directory..."
    />
  );
}