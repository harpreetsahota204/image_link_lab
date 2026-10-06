"""
Step 1: compute the two signals, pHash (pixels) and CLIP (meaning).
"""
import fiftyone.operators as foo
import fiftyone.operators.types as types

from .. import engine


class ComputeSignals(foo.Operator):
    @property
    def config(self):
        return foo.OperatorConfig(
            name="compute_signals",
            label="Image Link Lab: compute signals",
            description=(
                "Computes a perceptual hash (pHash) and a CLIP embedding for "
                "each image. Both become native similarity indexes"
            ),
            icon="fingerprint",
            dynamic=True,
            execute_as_generator=True,
            allow_immediate_execution=True,
            allow_delegated_execution=True,
            default_choice_to_delegated=True,
        )

    def resolve_input(self, ctx):
        inputs = types.Object()
        status = engine.signal_status(ctx.dataset)
        inputs.view_target(ctx)

        inputs.bool(
            "phash",
            default=not status["phash"],
            label="pHash: how the pixels are laid out",
            description=(
                "Already computed; tick to recompute"
                if status["phash"]
                else "Fast: about a minute per 10,000 images"
            ),
            view=types.CheckboxView(),
        )
        inputs.bool(
            "clip",
            default=not status["clip"],
            label="CLIP: what the picture shows",
            description=(
                "Already computed; tick to recompute"
                if status["clip"]
                else "Downloads the zoo model on first use; needs a GPU to be quick"
            ),
            view=types.CheckboxView(),
        )
        if not ctx.params.get("phash") and not ctx.params.get("clip"):
            inputs.view(
                "nothing", types.Warning(label="Pick at least one signal to compute")
            )

        return types.Property(inputs, view=types.View(label="Compute signals"))

    def resolve_delegation(self, ctx):
        return ctx.params.get("delegate")

    def execute(self, ctx):
        view = ctx.target_view()
        summary = {"hashed": 0, "clip": None}

        def report(fraction, label):
            if ctx.delegated:
                ctx.set_progress(progress=fraction, label=label)

        if ctx.params.get("phash"):
            if not ctx.delegated:
                yield ctx.trigger("set_progress", {"progress": 0.0, "label": "Hashing images"})

            summary["hashed"] = engine.compute_phash(
                view, progress=lambda fraction, label: report(0.4 * fraction, label)
            )

        if ctx.params.get("clip"):
            report(0.4, "Computing CLIP embeddings")
            if not ctx.delegated:
                yield ctx.trigger(
                    "set_progress", {"progress": 0.4, "label": "Computing CLIP embeddings"}
                )

            summary["clip"] = engine.compute_clip(view)

        report(1.0, "Done")
        yield summary

    def resolve_output(self, ctx):
        outputs = types.Object()
        outputs.int("hashed", label="Images hashed")
        outputs.str("clip", label="CLIP index")
        return types.Property(outputs, view=types.View(label="Signals ready"))
