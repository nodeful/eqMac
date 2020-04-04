import { Component, OnInit, Input, Output, EventEmitter, ChangeDetectorRef } from '@angular/core'
import { BasicEqualizerService, BasicEqualizerPreset, BasicEqualizerBand, BasicEqualizerPresetGains } from './basic-equalizer.service'
import { BridgeService } from '../../../../services/bridge.service'
import { EqualizerComponent } from '../equalizer.component'
import { KnobValueChangedEvent } from '../../../../modules/eqmac-components/components/knob/knob.component'
import { TransitionService } from '../../../../services/transitions.service'
import { ApplicationService } from '../../../../services/app.service'

@Component({
  selector: 'eqm-basic-equalizer',
  templateUrl: './basic-equalizer.component.html',
  styleUrls: ['./basic-equalizer.component.scss']
})
export class BasicEqualizerComponent extends EqualizerComponent implements OnInit {
  @Input() enabled = true

  gains: BasicEqualizerPresetGains = {
    bass: 0,
    mid: 0,
    treble: 0
  }

  private _presets: BasicEqualizerPreset[]
  @Output() presetsChange = new EventEmitter<BasicEqualizerPreset[]>()
  set presets (newPresets: BasicEqualizerPreset[]) {
    this._presets = newPresets
    this.presetsChange.emit(this.presets)
  }
  get presets () { return this._presets }

  private _selectedPreset: BasicEqualizerPreset
  @Output() selectedPresetChange = new EventEmitter<BasicEqualizerPreset>()
  set selectedPreset (newSelectedPreset: BasicEqualizerPreset) {
    this._selectedPreset = newSelectedPreset
    this.selectedPresetChange.emit(this.selectedPreset)
  }
  get selectedPreset () { return this._selectedPreset }

  settings = []

  constructor (
    private service: BasicEqualizerService,
    private app: ApplicationService,
    private bridge: BridgeService,
    private change: ChangeDetectorRef,
    private transition: TransitionService
  ) {
    super()
  }

  async ngOnInit () {
    this.setupEvents()
  }

  protected setupEvents () {
    this.service.onPresetsChanged(presets => {
      this.presets = presets
    })
    this.service.onSelectedPresetChanged(preset => {
      this.selectedPreset = preset
      this.setSelectedPresetsGains()
    })
  }

  async sync () {
    await Promise.all([
      this.syncPresets()
    ])
  }

  async syncPresets () {
    const [ presets, selectedPreset ] = await Promise.all([
      this.service.getPresets(),
      this.service.getSelectedPreset()
    ])
    this.presets = presets
    this.selectedPreset = this.getPreset(selectedPreset.id)
    this.setSelectedPresetsGains()
  }

  async selectPreset (preset: BasicEqualizerPreset) {
    this.selectedPreset = preset
    this.setSelectedPresetsGains()
    await this.service.selectPreset(preset)
  }

  stickSlidersToMiddle = true
  setSelectedPresetsGains () {
    // TODO: Refactor this bollocks
    for (const [type, gain] of Object.entries(this.selectedPreset.gains)) {
      const currentGain: number = this.gains[type]
      if (currentGain !== gain) {
        this.stickSlidersToMiddle = false
        this.change.detectChanges()
        this.transition.perform(currentGain, gain, value => {
          this.gains[type] = value
          if (value === gain) {
            this.stickSlidersToMiddle = true
          }
          this.change.detectChanges()
        })
      }
    }
  }

  selectFlatPreset () {
    return this.selectPreset(this.getPreset('flat'))
  }

  getPreset (id: string) {
    return this.presets.find(p => p.id === id)
  }

  async savePreset (name: string) {
    const { gains } = this.selectedPreset
    await this.service.createPreset({ name, gains }, true)
    await this.syncPresets()
  }

  async deletePreset () {
    if (!this.selectedPreset.isDefault) {
      await this.service.deletePreset(this.selectedPreset)
      await this.syncPresets()
      await this.selectFlatPreset()
    }
  }

  async setGain (band: BasicEqualizerBand, event: KnobValueChangedEvent) {
    const manualPreset = this.presets.find(p => p.id === 'manual')
    if (this.selectedPreset.id !== manualPreset.id) {
      manualPreset.gains = { ...this.selectedPreset.gains }
    }
    manualPreset.gains[band] = event.value
    this.selectedPreset = manualPreset

    if (!event.transition) {
      this.setSelectedPresetsGains()
    }
    await this.service.updatePreset(manualPreset, {
      select: true,
      transition: event.transition
    })
  }

  screenValue (gain: number) {
    return `${gain > 0 ? '+' : ''}${(gain.toFixed(1))}dB`
  }

  performHapticFeedback (animating) {
    if (!animating) {
      this.app.haptic()
    }
  }
}