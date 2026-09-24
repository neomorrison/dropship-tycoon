// The title screen's live city block at dusk, slowly orbiting behind the menu (the painted title art stays
// underneath until it is ready, and for good if 3D can't run).
import { useEffect, useRef } from 'react'
import { useStage } from '../../../three/react'
import { mark3dFailed, stageUrl, useStageQuality } from './session'
import './scene3d.css'

export default function TitleDiorama({ onReady, active = true }: { onReady: () => void; active?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const quality = useStageQuality()
  const stage = useStage(ref, { url: stageUrl, quality, onReady, onError: e => mark3dFailed(e) })
  useEffect(() => {
    if (!stage) return
    stage.setCameraMode('orbit')
    stage.setTimeOfDay(18.7)
    stage.setSpeed(1)
    void stage.setRoom('title_city')
  }, [stage])
  useEffect(() => {
    stage?.setActive(active)
  }, [stage, active])
  return (
    <div className="sh-title-3d">
      <canvas ref={ref} aria-hidden />
    </div>
  )
}
