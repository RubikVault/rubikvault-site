export class StageProfiler {
    constructor() {
        this.stages = [];
        this.currentStage = null;
        this.startTime = null;
    }

    start(name) {
        if (this.currentStage) this.end();
        this.currentStage = { name, start: Date.now() };
        this.startTime = this.startTime || this.currentStage.start;
        console.log(`[Profiler] Starting stage: ${name}`);
    }

    end() {
        if (!this.currentStage) return;
        const duration = Date.now() - this.currentStage.start;
        this.stages.push({ ...this.currentStage, duration });
        console.log(`[Profiler] Finished stage: ${this.currentStage.name} (${duration}ms)`);
        this.currentStage = null;
    }

    getReport() {
        if (this.currentStage) this.end();
        const total = this.startTime ? Date.now() - this.startTime : 0;
        return {
            total_duration_ms: total,
            stages: this.stages
        };
    }
}

export function profile(target, name, descriptor) {
    const original = descriptor.value;
    descriptor.value = async function (...args) {
        const start = Date.now();
        try {
            return await original.apply(this, args);
        } finally {
            console.log(`[Profiler] ${name} took ${Date.now() - start}ms`);
        }
    };
    return descriptor;
}
