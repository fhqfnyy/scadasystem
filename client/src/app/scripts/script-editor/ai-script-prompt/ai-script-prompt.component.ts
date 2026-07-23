import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { ScriptLanguage, ScriptMode, ScriptParam } from '../../../_models/script';
import { ScriptService } from '../../../_services/script.service';

export interface AiScriptPromptData {
    title: string;
    prompt: string;
    language: ScriptLanguage;
    source: string;
    mode: ScriptMode;
    parameters: ScriptParam[];
}

@Component({
    selector: 'app-ai-script-prompt',
    templateUrl: './ai-script-prompt.component.html',
    styleUrls: ['./ai-script-prompt.component.scss']
})
export class AiScriptPromptComponent {
    working = false;
    error = '';

    constructor(
        public dialogRef: MatDialogRef<AiScriptPromptComponent>,
        @Inject(MAT_DIALOG_DATA) public data: AiScriptPromptData,
        private scriptService: ScriptService
    ) {}

    submit() {
        const prompt = this.data.prompt?.trim();
        if (!prompt || this.working) {
            return;
        }
        this.working = true;
        this.error = '';
        const request = this.data.language === ScriptLanguage.PYTHON
            ? this.scriptService.generatePythonScript(prompt, this.data.source || '')
            : this.scriptService.generateJavaScript(
                prompt,
                this.data.source || '',
                this.data.mode,
                this.data.parameters
            );
        request.subscribe(result => {
            const source = (result.source || '')
                .replace(/^```(?:python|javascript|js)?\s*/i, '')
                .replace(/```\s*$/i, '');
            if (!source) {
                this.working = false;
                this.error = 'AI returned empty source code.';
                return;
            }
            this.dialogRef.close({source});
        }, err => {
            this.working = false;
            this.error = err.error?.message || err.message || String(err);
        });
    }
}
