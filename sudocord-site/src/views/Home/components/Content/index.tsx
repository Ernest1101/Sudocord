import FeatureCloud from "./Cloud";
import Community from "./Community";
import Contribute from "./Contribute";
import FeatureMaintained from "./Maintained";
import FeaturePlugins from "./Plugins";
import Policy from "./Policy";

export default function HomeContent() {
    return (
        <div className="max-w-eq-lg mx-auto px-6">
            <h1 className="pt-12 pb-48 text-center text-4xl font-bold text-neutral-200 sm:text-5xl">
                What's special?
            </h1>

            <div className="flex flex-col">
                <div className="flex flex-col gap-12">
                    <FeaturePlugins />
                    <FeatureMaintained />
                    <FeatureCloud />
                </div>

                <h1 className="py-32 text-center text-4xl font-bold text-neutral-200 sm:text-5xl">
                    and more!
                </h1>

                <div className="flex justify-between gap-6 max-md:flex-col">
                    <Community />
                    <Contribute />
                    <Policy />
                </div>
            </div>
        </div>
    );
}
