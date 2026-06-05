// ui-daq/src/components/ai/ResponseStream.tsx
interface Props {
  text: string
  loading: boolean
}

export const ResponseStream: React.FC<Props> = ({ text, loading }) => {
  return (
      <div className="p-4 bg-gray-100 dark:bg-gray-800 rounded text-sm whitespace-pre-wrap">
        {loading && <div className="animate-pulse text-gray-400">Streaming response...</div>}
        {text}
      </div>
  )
}
